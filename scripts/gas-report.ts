/**
 * Measures what a Tieout run actually costs on Arc, from real receipts.
 *
 *   npm run gas -- --network=arc-testnet 0xTXHASH [0xTXHASH ...]
 *   npm run gas -- apps/web/public/demo/promptbazaar-arc-testnet.json
 *
 * Reads only. For each transaction it reports gas used, the fee in USDC,
 * how many memo-tagged payments it carried, and the cost per payment.
 * Pass a demo ledger file to measure the three scenario transactions.
 */
import { readFileSync } from "node:fs";
import { decodeEventLog, formatUnits, type Hex } from "viem";
import { NETWORKS, memoEvent, transferEvent, type PayoutRunLedger } from "@tieout/sdk";
import { clients, resolveNetwork } from "./env.js";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
let network = resolveNetwork();
let hashes: Hex[] = args.filter((a): a is Hex => /^0x[0-9a-fA-F]{64}$/.test(a));

const ledgerFile = args.find((a) => a.endsWith(".json"));
if (ledgerFile) {
  const ledger = JSON.parse(readFileSync(ledgerFile, "utf8")) as PayoutRunLedger & { scenario?: Record<string, string> };
  network = NETWORKS[ledger.network];
  const fromScenario = Object.values(ledger.scenario ?? {}).filter((v): v is Hex => /^0x[0-9a-fA-F]{64}$/.test(v));
  hashes = [...new Set([...(ledger.execution ? [ledger.execution.txHash] : []), ...fromScenario, ...hashes])];
}
if (hashes.length === 0) throw new Error("Usage: npm run gas -- [--network=arc-testnet] <txHash...> | <ledger.json>");

const { publicClient } = clients(network, { needsSigner: false });
const usdc = network.contracts.usdc.toLowerCase();

interface Row {
  tx: string;
  kind: string;
  payments: number;
  memos: number;
  gasUsed: bigint;
  gasPriceGwei: string;
  feeUsdc: string;
  perPaymentUsdc: string;
}
const rows: Row[] = [];

for (const hash of hashes) {
  const receipt = await publicClient.getTransactionReceipt({ hash });
  let payments = 0;
  let memos = 0;
  let anchors = 0;
  for (const log of receipt.logs) {
    const address = log.address.toLowerCase();
    try {
      if (address === usdc) {
        const { args } = decodeEventLog({ abi: [transferEvent], data: log.data, topics: log.topics });
        if ((args as { value: bigint }).value > 0n) payments += 1;
      } else if (address === network.contracts.memo.toLowerCase()) {
        decodeEventLog({ abi: [memoEvent], data: log.data, topics: log.topics });
        memos += 1;
      }
    } catch {
      // Not one of ours (BeforeMemo, EIP-7708 emitter, etc.).
    }
  }
  // An anchor is a memo with no positive-value transfer under it.
  anchors = Math.max(0, memos - payments);
  const feeWei = receipt.gasUsed * receipt.effectiveGasPrice;
  const kind = memos === 0 ? "plain transfer" : anchors > 0 ? `batch, ${payments} memo payments + anchor` : `${payments} memo payment${payments === 1 ? "" : "s"}`;
  rows.push({
    tx: hash,
    kind,
    payments,
    memos,
    gasUsed: receipt.gasUsed,
    gasPriceGwei: formatUnits(receipt.effectiveGasPrice, 9),
    feeUsdc: formatUnits(feeWei, 18),
    perPaymentUsdc: payments ? formatUnits(feeWei / BigInt(payments), 18) : "-",
  });
}

console.log(`\n${network.name} · gas measured from receipts\n`);
console.log("| Transaction | What it carried | Gas used | Gas price (gwei) | Fee (USDC) | Per payment (USDC) |");
console.log("|---|---|---:|---:|---:|---:|");
for (const r of rows) {
  const short = `${r.tx.slice(0, 10)}…${r.tx.slice(-4)}`;
  console.log(`| [${short}](${network.explorerUrl}/tx/${r.tx}) | ${r.kind} | ${r.gasUsed.toLocaleString("en-US")} | ${Number(r.gasPriceGwei).toFixed(2)} | ${Number(r.feeUsdc).toFixed(6)} | ${r.perPaymentUsdc === "-" ? "-" : Number(r.perPaymentUsdc).toFixed(6)} |`);
}
const batch = rows.find((r) => r.memos > r.payments && r.payments > 1);
const single = rows.find((r) => r.memos === 0 && r.payments === 1);
if (batch && single) {
  const overhead = Number(batch.perPaymentUsdc) / Number(single.feeUsdc);
  console.log(`\nA memo-tagged payment inside a batch costs ${overhead.toFixed(2)}x a plain transfer, before the anchor is amortised.`);
}
