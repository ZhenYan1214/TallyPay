/**
 * Re-runs a Tieout audit bundle and checks that it still reconciles the same way.
 *
 *   npm run verify-bundle -- tieout-audit-4ec7a0-2026-10-13.json            # recompute from the bundle's own chain scan
 *   npm run verify-bundle -- tieout-audit-4ec7a0-2026-10-13.json --rescan   # also read Arc again and compare the scan
 *
 * This is what "anyone with a public RPC can re-run it" means in practice:
 * the bundle carries the ledgers, the recorded decisions, the trusted
 * reference signers and the frozen chain activity. The reconciler is a pure
 * function of those, so the outcome must be identical; with --rescan the
 * chain is read live for the same block range and every transfer must
 * still be there with the same amount.
 */
import { readFileSync } from "node:fs";
import type { Address } from "viem";
import { NETWORKS, observeAccount, parseActivity, type NetworkId } from "@tieout/sdk";
import { reconcile, type Decision, type ReconItem } from "@tieout/recon";
import { clients } from "./env.js";

const file = process.argv.slice(2).find((a) => a.endsWith(".json"));
if (!file) throw new Error("Usage: npm run verify-bundle -- <audit-bundle.json> [--rescan]");
const rescan = process.argv.includes("--rescan");

interface Bundle {
  tieout: { version: number; generatedAt: string; network: NetworkId; account: Address; trustedReferenceSigners: Address[] };
  ledgers: Array<{ PmtInfId: string; instructions: Parameters<typeof reconcile>[0][number]["instructions"] }>;
  decisions: Decision[];
  activity: unknown;
  report: { summary: Record<string, unknown>; items: Array<{ status: string; EndToEndId?: string; txHash?: string; logIndex?: number; evidence?: string }> };
}

const bundle = JSON.parse(readFileSync(file, "utf8")) as Bundle;
if (bundle.tieout?.version !== 1) throw new Error("Not a Tieout audit bundle (version 1)");
const { activity } = parseActivity(JSON.stringify({ version: 1, takenAt: bundle.tieout.generatedAt, activity: bundle.activity }));

const report = reconcile(
  bundle.ledgers.map((l) => ({ PmtInfId: l.PmtInfId, instructions: l.instructions })),
  activity,
  { trustedReferenceSigners: bundle.tieout.trustedReferenceSigners, decisions: bundle.decisions ?? [], incoming: bundle.ledgers.length ? "auto" : "reconcile", now: new Date(bundle.tieout.generatedAt) },
);

const key = (i: { EndToEndId?: string; txHash?: string; logIndex?: number }) => `${i.EndToEndId ?? ""}|${i.txHash ?? ""}|${i.logIndex ?? ""}`;
const recorded = new Map(bundle.report.items.map((i) => [key(i), i]));
const recomputed = new Map(report.items.map((i: ReconItem) => [key({ EndToEndId: i.instruction?.EndToEndId, txHash: i.transfer?.txHash, logIndex: i.transfer?.logIndex }), i]));

let diffs = 0;
for (const [k, r] of recorded) {
  const now = recomputed.get(k);
  if (!now) {
    console.log(`MISSING  ${k}  (recorded ${r.status}, not produced now)`);
    diffs++;
  } else if (now.status !== r.status || (now.evidence ?? "") !== (r.evidence ?? "")) {
    console.log(`CHANGED  ${k}  recorded ${r.status}/${r.evidence ?? "-"} → now ${now.status}/${now.evidence ?? "-"}`);
    diffs++;
  }
}
for (const k of recomputed.keys()) {
  if (!recorded.has(k)) {
    console.log(`NEW      ${k}  (${recomputed.get(k)!.status})`);
    diffs++;
  }
}
const s = report.summary;
console.log(
  `\nRecomputed from the bundle's scan: ${report.items.length} items · ${s.matched} matched · ${s.matched_by_intent} by intent · ${s.mismatch} mismatch · ${s.ambiguous} ambiguous · ${s.missing} missing · ${s.duplicate} duplicate · ${s.unexpected} unexpected`,
);
console.log(diffs === 0 ? "Bundle verified: every recorded outcome reproduces." : `${diffs} difference(s) between the recorded report and the recomputation.`);

if (rescan) {
  const network = NETWORKS[bundle.tieout.network];
  const { publicClient } = clients(network, { needsSigner: false });
  console.log(`\nRe-reading ${network.name} blocks ${activity.fromBlock}-${activity.toBlock} for ${activity.account}…`);
  const live = await observeAccount({
    client: publicClient,
    network,
    account: activity.account,
    fromBlock: activity.fromBlock,
    toBlock: activity.toBlock,
    memoSenders: bundle.tieout.trustedReferenceSigners,
  });
  const sig = (t: { txHash: string; logIndex: number; amount: bigint; from: string; to: string }) => `${t.txHash}:${t.logIndex}:${t.from.toLowerCase()}:${t.to.toLowerCase()}:${t.amount}`;
  const frozen = new Set(activity.transfers.map(sig));
  const current = new Set(live.transfers.map(sig));
  const gone = [...frozen].filter((x) => !current.has(x));
  const added = [...current].filter((x) => !frozen.has(x));
  for (const g of gone) console.log(`NOT ON CHAIN NOW  ${g}`);
  for (const a of added) console.log(`NOT IN BUNDLE     ${a}`);
  const balancesSame = JSON.stringify(live.balances, (_k, v) => (typeof v === "bigint" ? v.toString() : v)) === JSON.stringify(activity.balances, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
  console.log(gone.length === 0 && added.length === 0 && balancesSame ? "Chain matches the bundle: same transfers, same balances." : "Chain differs from the bundle (see above).");
  if (gone.length || added.length || !balancesSame) process.exitCode = 2;
}
if (diffs) process.exitCode = 1;
