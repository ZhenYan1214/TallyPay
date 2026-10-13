import { getAddress, type Address, type Hex } from "viem";
import {
  controlSum,
  fromUnits,
  ledgerHash,
  normalizeInstruction,
  toUnits,
  NATIVE_TO_UNITS,
  type AccountActivity,
  type AnchorObservation,
  type PayoutInstruction,
  type TokenSymbol,
  type TransferObservation,
} from "@tieout/sdk";

export type ReconStatus =
  /** Memo EndToEndId, counterparty, amount and token all agree with the ledger. */
  | "matched"
  /** No memo, but an unclaimed transfer has the same counterparty, amount and token. */
  | "matched_by_intent"
  /** Memo points at a ledger entry, but counterparty, amount, token or direction differ. */
  | "mismatch"
  /** Ledger entry with no corresponding transfer. */
  | "missing"
  /** A further transfer for an EndToEndId that was already settled. */
  | "duplicate"
  /** Transfer that the ledger does not explain. */
  | "unexpected";

export type Direction = "out" | "in";

export interface ReconItem {
  status: ReconStatus;
  /** "out": the account paid. "in": the account received. */
  direction: Direction;
  instruction?: PayoutInstruction & { PmtInfId: string };
  transfer?: TransferObservation;
  /** Chain amount minus ledger amount, in 6-decimal units. Negative = short-paid, positive = over-paid. */
  varianceUnits?: bigint;
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

/**
 * Opening balance + receipts - payments - fees should equal the closing
 * balance. Anything left over is money that moved in a way the scan did not
 * see, which is exactly what an auditor wants surfaced.
 */
export interface BalanceRollForward {
  token: TokenSymbol;
  opening: bigint;
  inflow: bigint;
  outflow: bigint;
  /** Network fees in 6-decimal units (USDC only). */
  fees: bigint;
  expectedClosing: bigint;
  closing: bigint;
  /** closing - expectedClosing. Zero means every movement is explained. */
  unexplained: bigint;
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
  /** Present when the scan could read balances at both edges of the range. */
  rollForward?: BalanceRollForward[];
  /** Incoming transfers left out because the ledger has no receivables. */
  ignoredIncoming: { count: number; units: bigint };
  summary: Record<ReconStatus, number> & {
    expectedUnits: bigint;
    settledUnits: bigint;
    exceptionUnits: bigint;
    /** Of the expected/settled totals, how much is receivable (direction "in"). */
    expectedInUnits: bigint;
    settledInUnits: bigint;
  };
}

export interface ReconcileOptions {
  /**
   * Seconds after the first ledger-matched transfer within which a memo-less
   * transfer may be matched by intent. Undefined means no time limit.
   */
  intentWindowSeconds?: number;
  /**
   * What to do with incoming transfers. "auto" (default) reconciles them when
   * the ledger has at least one receivable entry and ignores them otherwise.
   */
  incoming?: "auto" | "reconcile" | "ignore";
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

function varianceNote(transfer: TransferObservation, ledgerUnits: bigint): string | undefined {
  const diff = transfer.amount - ledgerUnits;
  if (diff === 0n) return undefined;
  const label = diff < 0n ? "Short-paid" : "Over-paid";
  return `${label} by ${fromUnits(diff < 0n ? -diff : diff)}: chain ${fromUnits(transfer.amount)} vs ledger ${fromUnits(ledgerUnits)}`;
}

/**
 * Matches an account's on-chain activity against its own ledger, in both
 * directions.
 *
 * Pass 1 uses memos: a transfer whose memo carries a known EndToEndId is
 * compared field by field with that ledger entry.
 * Pass 2 handles wallets that cannot attach memos (Safe, MPC custody) and
 * payers who did not: remaining entries are paired with remaining transfers
 * that have the same counterparty, token and amount, oldest first.
 * Whatever is left becomes "missing" (ledger side) or "unexpected" (chain side).
 */
export function reconcile(runs: LedgerRun[], activity: AccountActivity, options: ReconcileOptions = {}): ReconReport {
  const account = getAddress(activity.account);
  const entries = runs.flatMap((run) =>
    run.instructions.map((i) => ({ ...normalizeInstruction(i), PmtInfId: run.PmtInfId })),
  );
  const byId = new Map(entries.map((e) => [e.EndToEndId, e]));
  if (byId.size !== entries.length) throw new Error("Ledger contains duplicate EndToEndIds");

  const hasReceivables = entries.some((e) => e.direction === "in");
  const incomingMode = options.incoming ?? "auto";
  const reconcileIncoming = incomingMode === "reconcile" || (incomingMode === "auto" && hasReceivables);

  const outgoing = activity.transfers.filter((t) => same(t.from, account));
  const incomingAll = activity.transfers.filter((t) => same(t.to, account) && !same(t.from, account));
  const incoming = reconcileIncoming ? incomingAll : [];
  const ignoredIncoming = reconcileIncoming
    ? { count: 0, units: 0n }
    : { count: incomingAll.length, units: incomingAll.reduce((s, t) => s + t.amount, 0n) };

  const items: ReconItem[] = [];
  const settled = new Set<string>();
  const claimed = new Set<TransferObservation>();
  const directionOf = (t: TransferObservation): Direction => (same(t.from, account) ? "out" : "in");

  // Pass 1: memo-linked transfers.
  for (const transfer of [...outgoing, ...incoming]) {
    const memo = transfer.memo?.decoded;
    if (memo?.kind !== "payment") continue;
    const entry = byId.get(memo.memo.EndToEndId);
    if (!entry) continue;
    claimed.add(transfer);
    const direction = directionOf(transfer);

    if (settled.has(entry.EndToEndId)) {
      items.push({ status: "duplicate", direction, instruction: entry, transfer, notes: ["EndToEndId was already settled"] });
      continue;
    }
    settled.add(entry.EndToEndId);

    const notes: string[] = [];
    const ledgerUnits = toUnits(entry.amount);
    if (entry.direction !== direction) {
      notes.push(`Ledger expects money ${entry.direction === "in" ? "in" : "out"} but this transfer went ${direction}`);
    } else if (direction === "out") {
      if (!same(transfer.to, entry.recipient)) notes.push(`Recipient ${transfer.to} differs from ledger ${entry.recipient}`);
    } else if (entry.payer && !same(transfer.from, entry.payer)) {
      notes.push(`Payer ${transfer.from} differs from ledger ${entry.payer}`);
    }
    const variance = varianceNote(transfer, ledgerUnits);
    if (variance) notes.push(variance);
    if (transfer.token !== entry.token) notes.push(`Token ${transfer.token} differs from ledger ${entry.token}`);
    if (memo.memo.PmtInfId && memo.memo.PmtInfId !== entry.PmtInfId) {
      notes.push(`Memo run ${memo.memo.PmtInfId} differs from ledger run ${entry.PmtInfId}`);
    }
    items.push({
      status: notes.length ? "mismatch" : "matched",
      direction,
      instruction: entry,
      transfer,
      varianceUnits: transfer.amount - ledgerUnits,
      notes,
    });
  }

  // Pass 2: intent matching for memo-less transfers.
  const firstMatched = items
    .filter((i) => i.transfer)
    .reduce<number | undefined>((min, i) => (min === undefined || i.transfer!.timestamp < min ? i.transfer!.timestamp : min), undefined);
  const inWindow = (t: TransferObservation) =>
    options.intentWindowSeconds === undefined || firstMatched === undefined || Math.abs(t.timestamp - firstMatched) <= options.intentWindowSeconds;
  const pool = [...outgoing, ...incoming].filter((t) => !claimed.has(t) && t.memo?.decoded.kind !== "payment");
  for (const entry of entries) {
    if (settled.has(entry.EndToEndId)) continue;
    const units = toUnits(entry.amount);
    const candidate = pool.find((t) => {
      if (claimed.has(t) || t.token !== entry.token || t.amount !== units || !inWindow(t)) return false;
      if (entry.direction === "out") return directionOf(t) === "out" && same(t.to, entry.recipient);
      return directionOf(t) === "in" && (!entry.payer || same(t.from, entry.payer));
    });
    if (!candidate) continue;
    claimed.add(candidate);
    settled.add(entry.EndToEndId);
    const how = entry.direction === "out" ? "recipient, token and amount" : entry.payer ? "payer, token and amount" : "token and amount";
    items.push({
      status: "matched_by_intent",
      direction: entry.direction!,
      instruction: entry,
      transfer: candidate,
      varianceUnits: 0n,
      notes: [`No memo on this transfer; matched on ${how}${candidate.native ? " (native USDC transfer)" : ""}`],
    });
  }

  for (const entry of entries) {
    if (!settled.has(entry.EndToEndId)) {
      items.push({
        status: "missing",
        direction: entry.direction!,
        instruction: entry,
        notes: [entry.direction === "in" ? "No incoming transfer found for this receivable" : "No transfer found for this ledger entry"],
      });
    }
  }
  for (const transfer of [...outgoing, ...incoming]) {
    if (claimed.has(transfer)) continue;
    const memo = transfer.memo?.decoded;
    const direction = directionOf(transfer);
    const notes =
      memo?.kind === "payment"
        ? [`Memo EndToEndId ${memo.memo.EndToEndId} is not in the ledger`]
        : memo
          ? ["Memo present but not in Tieout format"]
          : [direction === "in" ? "Received with no memo and no receivable matches" : "No memo and no ledger entry matches this transfer"];
    if (transfer.native) notes.push("Native USDC transfer (wallet send), not an ERC-20 call");
    items.push({ status: "unexpected", direction, transfer, notes });
  }

  const anchors = runs.map((run) =>
    checkAnchor(run, activity.anchors.filter((a) => same(a.sender, account)), activity.transfers, account),
  );

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
    expectedInUnits: entries.filter((e) => e.direction === "in").reduce((s, e) => s + toUnits(e.amount), 0n),
    settledInUnits: 0n,
  };
  for (const item of items) {
    summary[item.status] += 1;
    if (!item.transfer) continue;
    const cleared = item.status === "matched" || item.status === "matched_by_intent";
    if (cleared) {
      summary.settledUnits += item.transfer.amount;
      if (item.direction === "in") summary.settledInUnits += item.transfer.amount;
    } else summary.exceptionUnits += item.transfer.amount;
  }

  const feesWei = activity.fees.reduce((s, f) => s + f.feeWei, 0n);
  const rollForward = activity.balances?.map((b) => {
    const inflow = incomingAll.filter((t) => t.token === b.token).reduce((s, t) => s + t.amount, 0n);
    const outflow = outgoing.filter((t) => t.token === b.token).reduce((s, t) => s + t.amount, 0n);
    const fees = b.token === "USDC" ? feesWei / NATIVE_TO_UNITS : 0n;
    const expectedClosing = b.opening + inflow - outflow - fees;
    return { token: b.token, opening: b.opening, inflow, outflow, fees, expectedClosing, closing: b.closing, unexplained: b.closing - expectedClosing };
  });

  return {
    account,
    generatedAt: (options.now ?? new Date()).toISOString(),
    items: sortItems(items),
    anchors,
    feesWei,
    rollForward,
    ignoredIncoming,
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
  const instructions = run.instructions.map(normalizeInstruction).filter((i) => i.direction !== "in");
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
