/**
 * PromptBazaar demo: a fictional AI prompt marketplace pays its sellers for
 * the month, then a few realistic things go wrong. Writes the platform's
 * ledger to apps/web/public/demo/ so the console can reconcile it.
 *
 *   npm run demo -- --network=arc-testnet
 *   npm run demo -- --network=arc-mainnet
 *
 * Scenario:
 *   - 10 sellers are paid in one batch with memos and a run anchor.
 *   - Seller 07 is paid separately by a plain transfer with no memo,
 *     as a Safe or MPC wallet would do. Expect: matched_by_intent.
 *   - Seller 12 is on hold and never paid. Expect: missing.
 *   - After the run, someone edits seller 04's amount in the ledger.
 *     Expect: mismatch, and the run anchor no longer verifies.
 *   - The treasury sends funds to an address the ledger does not know.
 *     Expect: unexpected.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { encodeFunctionData, type Hex } from "viem";
import {
  buildPayoutRun,
  erc20Abi,
  fromUnits,
  toUnits,
  MIN_MAX_FEE_PER_GAS,
  type PayoutInstruction,
  type PayoutRunLedger,
} from "@tallypay/sdk";
import { clients, resolveNetwork } from "./env.js";
import { demoWallet } from "./demo-wallets.js";

const network = resolveNetwork();
const { publicClient, walletClient, account } = clients(network);
const payer = account!.address;
const payerKey = (process.env[network.id === "arc-mainnet" ? "MAINNET_PRIVATE_KEY" : "TESTNET_PRIVATE_KEY"]!.trim().replace(/^(?!0x)/, "0x")) as Hex;

// Earnings are real but small so the demo costs a few dollars at most.
const SELLERS: Array<{ name: string; country: string; amount: string; Purp: string }> = [
  { name: "Aiko Tanaka", country: "JP", amount: "0.184", Purp: "COMM" },
  { name: "Lucas Ferreira", country: "BR", amount: "0.097", Purp: "COMM" },
  { name: "Amara Okafor", country: "NG", amount: "0.215", Purp: "COMM" },
  { name: "Priya Raman", country: "IN", amount: "0.150", Purp: "COMM" },
  { name: "Mateo Rojas", country: "AR", amount: "0.062", Purp: "COMM" },
  { name: "Lea Schmidt", country: "DE", amount: "0.131", Purp: "COMM" },
  { name: "Minh Nguyen", country: "VN", amount: "0.078", Purp: "COMM" },
  { name: "Sofia Petrova", country: "BG", amount: "0.109", Purp: "COMM" },
  { name: "Chen Wei-Ting", country: "TW", amount: "0.243", Purp: "COMM" },
  { name: "Omar Haddad", country: "JO", amount: "0.056", Purp: "COMM" },
  { name: "Grace Mensah", country: "GH", amount: "0.120", Purp: "COMM" },
  { name: "Daniel Kim", country: "KR", amount: "0.090", Purp: "COMM" },
];

const month = new Date().toISOString().slice(0, 7).replace("-", "");
const runId = `PB-${month}-${Date.now().toString(36).slice(-4).toUpperCase()}`;

const ledger: PayoutInstruction[] = SELLERS.map((s, i) => {
  const n = String(i + 1).padStart(2, "0");
  return {
    EndToEndId: `${runId}-S${n}`,
    recipient: demoWallet(payerKey, `seller-${n}`).account.address,
    amount: s.amount,
    token: "USDC",
    Purp: s.Purp,
    CdtrRef: `STMT-${month}-S${n}`,
    payeeName: s.name,
    payeeCountry: s.country,
  };
});

const MANUAL = `${runId}-S07`;
const ON_HOLD = `${runId}-S12`;
const EDITED = `${runId}-S04`;
const batch = ledger.filter((i) => i.EndToEndId !== MANUAL && i.EndToEndId !== ON_HOLD);

const total = ledger.reduce((s, i) => s + toUnits(i.amount), 0n);
const balance = await publicClient.readContract({ address: network.contracts.usdc, abi: erc20Abi, functionName: "balanceOf", args: [payer] });
console.log(`${network.name} · payer ${payer} · balance ${fromUnits(balance)} USDC · run ${runId} needs ~${fromUnits(total + 100_000n)} USDC`);
if (balance < total + 100_000n) throw new Error("Not enough USDC for the demo run plus fees");

const fees = { maxFeePerGas: MIN_MAX_FEE_PER_GAS * 3n, maxPriorityFeePerGas: 1_000_000_000n };
const startBlock = await publicClient.getBlockNumber();

// 1. Batch payout with memos and a run anchor.
const plan = buildPayoutRun({ network, payer, PmtInfId: runId, instructions: batch });
await publicClient.call({ account: payer, to: plan.to, data: plan.data });
const runTx = await walletClient!.sendTransaction({ to: plan.to, data: plan.data, ...fees });
const runReceipt = await publicClient.waitForTransactionReceipt({ hash: runTx });
console.log(`1. Batch of ${batch.length} paid · ${network.explorerUrl}/tx/${runTx}`);

// 2. Seller 07 paid with a plain transfer and no memo.
const manual = ledger.find((i) => i.EndToEndId === MANUAL)!;
const manualTx = await walletClient!.sendTransaction({
  to: network.contracts.usdc,
  data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [manual.recipient, toUnits(manual.amount)] }),
  ...fees,
});
await publicClient.waitForTransactionReceipt({ hash: manualTx });
console.log(`2. Seller 07 paid without memo · ${network.explorerUrl}/tx/${manualTx}`);

// 3. An outflow the ledger does not know about.
const stray = demoWallet(payerKey, "unknown-counterparty").account.address;
const strayTx = await walletClient!.sendTransaction({
  to: network.contracts.usdc,
  data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [stray, toUnits("0.045")] }),
  ...fees,
});
const strayReceipt = await publicClient.waitForTransactionReceipt({ hash: strayTx });
console.log(`3. Unrecorded transfer · ${network.explorerUrl}/tx/${strayTx}`);

// 4. Someone edits seller 04's amount after the run. The anchor still commits to the original.
const ledgerAfterEdit = ledger.map((i) => (i.EndToEndId === EDITED ? { ...i, amount: "0.135" } : i));

const out: PayoutRunLedger & { scenario: Record<string, string>; scan: { fromBlock: string; toBlock: string } } = {
  PmtInfId: runId,
  network: network.id,
  payer,
  createdAt: new Date().toISOString(),
  description: "PromptBazaar seller payouts (simulated marketplace, real Arc transactions)",
  instructions: ledgerAfterEdit,
  execution: { txHash: runTx, blockNumber: runReceipt.blockNumber.toString() },
  scenario: {
    batchTx: runTx,
    manualNoMemoTx: manualTx,
    unrecordedTx: strayTx,
    editedAfterRun: EDITED,
    onHold: ON_HOLD,
  },
  scan: { fromBlock: startBlock.toString(), toBlock: strayReceipt.blockNumber.toString() },
};

const here = dirname(fileURLToPath(import.meta.url));
const file = resolve(here, `../apps/web/public/demo/promptbazaar-${network.id}.json`);
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
console.log(`\nLedger written to ${file}`);
