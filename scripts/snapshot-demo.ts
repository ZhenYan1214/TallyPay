/**
 * Freezes the chain scan for a demo ledger to JSON, next to the ledger:
 *
 *   npm run snapshot -- apps/web/public/demo/promptbazaar-arc-mainnet.json
 *
 * The web app scans Arc live first and only falls back to this snapshot
 * when the public RPC fails, labelling the result as a snapshot with the
 * time it was taken. Re-run after every demo run so the two stay in sync.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { NETWORKS, observeAccount, serializeActivity, type PayoutRunLedger } from "@tallypay/sdk";
import { reconcile } from "@tallypay/recon";
import { clients } from "./env.js";

const file = process.argv.slice(2).find((a) => a.endsWith(".json"));
if (!file) throw new Error("Usage: npm run snapshot -- <ledger.json>");

const ledger = JSON.parse(readFileSync(file, "utf8")) as PayoutRunLedger & { scan?: { fromBlock: string; toBlock: string } };
const network = NETWORKS[ledger.network];
const { publicClient } = clients(network, { needsSigner: false });

const fromBlock = BigInt(ledger.scan?.fromBlock ?? ledger.execution?.blockNumber ?? 0);
const toBlock = ledger.scan?.toBlock ? BigInt(ledger.scan.toBlock) : undefined;
const activity = await observeAccount({ client: publicClient, network, account: ledger.payer, fromBlock, toBlock });

// Sanity check: the snapshot must reconcile the same way a live scan does.
const report = reconcile([{ PmtInfId: ledger.PmtInfId, instructions: ledger.instructions }], activity);
const s = report.summary;
console.log(
  `${network.name} · ${activity.transfers.length} transfers · ${activity.anchors.length} anchors · ` +
    `${s.matched} matched · ${s.matched_by_intent} by intent · ${s.mismatch} mismatch · ${s.missing} missing · ${s.duplicate} duplicate · ${s.unexpected} unexpected`,
);

const out = file.replace(/\.json$/, ".activity.json");
writeFileSync(out, serializeActivity(activity));
console.log(`Snapshot written to ${out}`);
