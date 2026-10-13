import { getAddress, type Address, type Hex } from "viem";
import {
  controlSum,
  fromUnits,
  ledgerHash,
  normalizeInstruction,
  toUnits,
  type AccountActivity,
  type AnchorObservation,
  type PayoutInstruction,
  type TransferObservation,
} from "@tallypay/sdk";

export type ReconStatus =
  /** Memo EndToEndId, recipient, amount and token all agree with the ledger. */
  | "matched"
  /** No memo, but an unclaimed transfer has the same recipient, amount and token. */
  | "matched_by_intent"
  /** Memo points at a ledger entry, but recipient, amount or token differ. */
  | "mismatch"
  /** Ledger entry with no corresponding transfer. */
  | "missing"
  /** A further transfer for an EndToEndId that was already paid. */
  | "duplicate"
  /** Outgoing transfer that the ledger does not explain. */
  | "unexpected";

export interface ReconItem {
  status: ReconStatus;
  instruction?: PayoutInstruction & { PmtInfId: string };
  transfer?: TransferObservation;
  notes: string[];
}

export type AnchorStatus = "verified" | "mismatch" | "absent";

export interface AnchorCheck {
  PmtInfId: string;
  status: AnchorStatus;
  expected: { NbOfTxs: number; CtrlSum: string; LedgerHash: Hex };
  observed?: AnchorObservation;
  /** EndToEndIds paid in the anchor transaction. */
  coveredIds: string[];
  /** Entries whose ledger values no longer match what was anchored and paid. */
  changedIds: string[];
  notes: string[];
}

export interface LedgerRun {
  PmtInfId: string;
  instructions: PayoutInstruction[];
}

export interface ReconReport {
  account: Address;
  generatedAt: string;
  items: ReconItem[];
  anchors: AnchorCheck[];
  feesWei: bigint;
  summary: Record<ReconStatus, number> & {
    expectedUnits: bigint;
    settledUnits: bigint;
    exceptionUnits: bigint;
  };
}

export interface ReconcileOptions {
  /**
   * Seconds after the first ledger-matched transfer within which a memo-less
   * transfer may be matched by intent. Undefined means no time limit.
   */
  intentWindowSeconds?: number;
  now?: Date;
}

/** Address comparison that ignores checksum casing. */
function same(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

const EXCEPTIONS: ReconStatus[] = ["mismatch", "duplicate", "unexpected", "missing"];

export function isException(status: ReconStatus): boolean {
  return EXCEPTIONS.includes(status);
}

/**
 * Matches an account's on-chain activity against the payer's own ledger.
 *
 * Pass 1 uses memos: a transfer whose memo carries a known EndToEndId is
 * compared field by field with that ledger entry.
 * Pass 2 handles wallets that cannot attach memos (Safe, MPC custody):
 * remaining entries are paired with remaining transfers that have the same
 * recipient, token and amount, oldest first.
 * Whatever is left becomes "missing" (ledger side) or "unexpected" (chain side).
 */
export function reconcile(runs: LedgerRun[], activity: AccountActivity, options: ReconcileOptions = {}): ReconReport {
  const account = getAddress(activity.account);
  const entries = runs.flatMap((run) =>
    run.instructions.map((i) => ({ ...normalizeInstruction(i), PmtInfId: run.PmtInfId })),
  );
  const byId = new Map(entries.map((e) => [e.EndToEndId, e]));
  if (byId.size !== entries.length) throw new Error("Ledger contains duplicate EndToEndIds");

  const outgoing = activity.transfers.filter((t) => same(t.from, account));
  const items: ReconItem[] = [];
  const settled = new Set<string>();
  const claimed = new Set<TransferObservation>();

  // Pass 1: memo-linked transfers.
  for (const transfer of outgoing) {
    const memo = transfer.memo?.decoded;
    if (memo?.kind !== "payment") continue;
    const entry = byId.get(memo.memo.EndToEndId);
    if (!entry) continue;
    claimed.add(transfer);

    if (settled.has(entry.EndToEndId)) {
      items.push({ status: "duplicate", instruction: entry, transfer, notes: ["EndToEndId was already paid"] });
      continue;
    }
    settled.add(entry.EndToEndId);

    const notes: string[] = [];
    if (!same(transfer.to, entry.recipient)) notes.push(`Recipient ${transfer.to} differs from ledger ${entry.recipient}`);
    if (transfer.amount !== toUnits(entry.amount)) notes.push(`Amount ${transfer.amount} differs from ledger ${toUnits(entry.amount)}`);
    if (transfer.token !== entry.token) notes.push(`Token ${transfer.token} differs from ledger ${entry.token}`);
    if (memo.memo.PmtInfId && memo.memo.PmtInfId !== entry.PmtInfId) {
      notes.push(`Memo run ${memo.memo.PmtInfId} differs from ledger run ${entry.PmtInfId}`);
    }
    items.push({ status: notes.length ? "mismatch" : "matched", instruction: entry, transfer, notes });
  }

  // Pass 2: intent matching for memo-less transfers.
  const firstMatched = items
    .filter((i) => i.transfer)
    .reduce<number | undefined>((min, i) => (min === undefined || i.transfer!.timestamp < min ? i.transfer!.timestamp : min), undefined);
  const pool = outgoing.filter((t) => !claimed.has(t) && t.memo?.decoded.kind !== "payment");
  for (const entry of entries) {
    if (settled.has(entry.EndToEndId)) continue;
    const units = toUnits(entry.amount);
    const candidate = pool.find(
      (t) =>
        !claimed.has(t) &&
        same(t.to, entry.recipient) &&
        t.token === entry.token &&
        t.amount === units &&
        (options.intentWindowSeconds === undefined ||
          firstMatched === undefined ||
          Math.abs(t.timestamp - firstMatched) <= options.intentWindowSeconds),
    );
    if (!candidate) continue;
    claimed.add(candidate);
    settled.add(entry.EndToEndId);
    items.push({
      status: "matched_by_intent",
      instruction: entry,
      transfer: candidate,
      notes: ["No memo on this transfer; matched on recipient, token and amount"],
    });
  }

  for (const entry of entries) {
    if (!settled.has(entry.EndToEndId)) {
      items.push({ status: "missing", instruction: entry, notes: ["No transfer found for this ledger entry"] });
    }
  }
  for (const transfer of outgoing) {
    if (claimed.has(transfer)) continue;
    const memo = transfer.memo?.decoded;
    const notes =
      memo?.kind === "payment"
        ? [`Memo EndToEndId ${memo.memo.EndToEndId} is not in the ledger`]
        : memo
          ? ["Memo present but not in Tallypay format"]
          : ["No memo and no ledger entry matches this transfer"];
    items.push({ status: "unexpected", transfer, notes });
  }

  const anchors = runs.map((run) => checkAnchor(run, activity.anchors.filter((a) => same(a.sender, account)), activity.transfers, account));

  const summary = {
    matched: 0,
    matched_by_intent: 0,
    mismatch: 0,
    missing: 0,
    duplicate: 0,
    unexpected: 0,
    expectedUnits: entries.reduce((s, e) => s + toUnits(e.amount), 0n),
    settledUnits: 0n,
    exceptionUnits: 0n,
  };
  for (const item of items) {
    summary[item.status] += 1;
    if (!item.transfer) continue;
    if (item.status === "matched" || item.status === "matched_by_intent") summary.settledUnits += item.transfer.amount;
    else summary.exceptionUnits += item.transfer.amount;
  }

  const feesWei = activity.fees.reduce((s, f) => s + f.feeWei, 0n);
  return {
    account,
    generatedAt: (options.now ?? new Date()).toISOString(),
    items: sortItems(items),
    anchors,
    feesWei,
    summary,
  };
}

/**
 * An anchor commits to the payments sent in its own transaction, which may be
 * a subset of the run (some entries can be paid separately or held back).
 * The anchored set is recovered from the memos in that transaction; the
 * current ledger values for those entries must hash to the anchored value.
 */
function checkAnchor(run: LedgerRun, anchors: AnchorObservation[], transfers: TransferObservation[], account: Address): AnchorCheck {
  const instructions = run.instructions.map(normalizeInstruction);
  const observed = anchors.find((a) => a.anchor.PmtInfId === run.PmtInfId);
  if (!observed) {
    return {
      PmtInfId: run.PmtInfId,
      status: "absent",
      expected: { NbOfTxs: instructions.length, CtrlSum: controlSum(instructions), LedgerHash: ledgerHash(instructions) },
      coveredIds: [],
      changedIds: [],
      notes: ["No run anchor found on-chain"],
    };
  }

  const anchoredTransfers = new Map<string, TransferObservation>();
  for (const t of transfers) {
    if (t.txHash !== observed.txHash || !same(t.from, account) || t.memo?.decoded.kind !== "payment") continue;
    anchoredTransfers.set(t.memo.decoded.memo.EndToEndId, t);
  }
  const coveredIds = [...anchoredTransfers.keys()].sort();
  const covered = instructions.filter((i) => anchoredTransfers.has(i.EndToEndId));
  const expected = { NbOfTxs: covered.length, CtrlSum: controlSum(covered), LedgerHash: ledgerHash(covered) };

  const notes: string[] = [];
  const changedIds: string[] = [];
  const removed = coveredIds.filter((id) => !instructions.some((i) => i.EndToEndId === id));
  if (removed.length) {
    changedIds.push(...removed);
    notes.push(`Removed from ledger after anchoring: ${removed.join(", ")}`);
  }
  for (const entry of covered) {
    const t = anchoredTransfers.get(entry.EndToEndId)!;
    const diffs: string[] = [];
    if (t.amount !== toUnits(entry.amount)) diffs.push(`amount ${fromUnits(t.amount)} → ${entry.amount}`);
    if (!same(t.to, entry.recipient)) diffs.push("recipient");
    if (t.token !== entry.token) diffs.push("token");
    if (diffs.length) {
      changedIds.push(entry.EndToEndId);
      notes.push(`${entry.EndToEndId} edited after anchoring (${diffs.join(", ")})`);
    }
  }
  if (observed.anchor.LedgerHash !== expected.LedgerHash && changedIds.length === 0) {
    notes.push("Ledger hash differs from the anchored hash");
  }
  if (observed.anchor.NbOfTxs !== coveredIds.length) {
    notes.push(`Anchor declares ${observed.anchor.NbOfTxs} payments but its transaction carries ${coveredIds.length}`);
  }
  const status: AnchorStatus = notes.length ? "mismatch" : "verified";
  return { PmtInfId: run.PmtInfId, status, expected, observed, coveredIds, changedIds, notes };
}

const ORDER: Record<ReconStatus, number> = {
  mismatch: 0,
  duplicate: 1,
  unexpected: 2,
  missing: 3,
  matched_by_intent: 4,
  matched: 5,
};

function sortItems(items: ReconItem[]): ReconItem[] {
  return [...items].sort((a, b) => {
    const byStatus = ORDER[a.status] - ORDER[b.status];
    if (byStatus) return byStatus;
    const ida = a.instruction?.EndToEndId ?? a.transfer?.txHash ?? "";
    const idb = b.instruction?.EndToEndId ?? b.transfer?.txHash ?? "";
    return ida.localeCompare(idb);
  });
}
