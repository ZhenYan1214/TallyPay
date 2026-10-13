/**
 * Reconciles a ledger file against Arc and prints the result.
 *
 *   npm run reconcile -- apps/web/public/demo/promptbazaar-arc-testnet.json
 *   npm run reconcile -- <ledger.json> --out=reports/
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NETWORKS, observeAccount, fromUnits, type PayoutRunLedger } from "@tallypay/sdk";
import { buildJournal, journalCsv, reconReportCsv, reconcile, xeroManualJournalCsv } from "@tallypay/recon";
import { formatUnits } from "viem";
import { clients } from "./env.js";

const file = process.argv.slice(2).find((a) => !a.startsWith("--"));
if (!file) throw new Error("Usage: npm run reconcile -- <ledger.json> [--out=dir]");
const outDir = process.argv.find((a) => a.startsWith("--out="))?.split("=")[1];

const ledger = JSON.parse(readFileSync(file, "utf8")) as PayoutRunLedger & { scan?: { fromBlock: string; toBlock: string } };
const network = NETWORKS[ledger.network];
const { publicClient } = clients(network, { needsSigner: false });

const fromBlock = BigInt(ledger.scan?.fromBlock ?? ledger.execution?.blockNumber ?? 0);
const toBlock = ledger.scan?.toBlock ? BigInt(ledger.scan.toBlock) : undefined;
const activity = await observeAccount({ client: publicClient, network, account: ledger.payer, fromBlock, toBlock });
const report = reconcile([{ PmtInfId: ledger.PmtInfId, instructions: ledger.instructions }], activity);

console.log(`\n${network.name} · ${ledger.payer} · blocks ${activity.fromBlock}-${activity.toBlock}`);
console.log(`Transfers observed: ${activity.transfers.length} · anchors: ${activity.anchors.length} · fees: ${formatUnits(report.feesWei, 18)} USDC\n`);
for (const item of report.items) {
  const id = item.instruction?.EndToEndId ?? item.transfer?.txHash.slice(0, 18);
  const amount = item.transfer ? fromUnits(item.transfer.amount) : item.instruction?.amount;
  console.log(`${item.status.padEnd(18)} ${String(id).padEnd(24)} ${String(amount).padStart(10)}  ${item.notes.join("; ")}`);
}
for (const a of report.anchors) console.log(`\nAnchor ${a.PmtInfId}: ${a.status} ${a.notes.join("; ")}`);
const s = report.summary;
console.log(`\nExpected ${fromUnits(s.expectedUnits)} · settled ${fromUnits(s.settledUnits)} · exceptions ${fromUnits(s.exceptionUnits)} USDC`);

if (outDir) {
  mkdirSync(outDir, { recursive: true });
  const journal = buildJournal(report, activity.fees);
  writeFileSync(join(outDir, "reconciliation.csv"), reconReportCsv(report, network.explorerUrl));
  writeFileSync(join(outDir, "journal.csv"), journalCsv(journal));
  writeFileSync(join(outDir, "xero-manual-journal.csv"), xeroManualJournalCsv(journal));
  console.log(`\nWrote reconciliation.csv, journal.csv, xero-manual-journal.csv to ${outDir}`);
}
