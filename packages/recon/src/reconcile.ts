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
  type ReferenceObservation,
  type TokenSymbol,
  type TransferObservation,
} from "@tieout/sdk";

export type ReconStatus =
  /** Memo (or an after-the-fact reference), counterparty, amount, token and direction all agree with the ledger. */
  | "matched"
  /** No memo, but exactly one unclaimed transfer has the same counterparty, amount and token, and fits no other entry. */
  | "matched_by_intent"
  /** Memo points at a ledger entry, but counterparty, amount, token or direction differ. */
  | "mismatch"
  /** No memo and more than one way to pair entries and transfers. Never auto-matched; a human decides. */
  | "ambiguous"
  /** Ledger entry with no corresponding transfer. */
  | "missing"
  /** A further transfer for an EndToEndId that was already settled. */
  | "duplicate"
  /** Transfer that the ledger does not explain. */
  | "unexpected";

export type Direction = "out" | "in";

/** How strong the link between ledger entry and transfer is, strongest first. "manual" is a recorded human decision. */
export type Evidence = "memo" | "reference" | "manual" | "intent";

/** A person's decision to settle one ledger entry with one specific transfer. Recorded in the audit bundle. */
export interface Decision {
  EndToEndId: string;
  txHash: Hex;
  logIndex: number;
  /** Free text: who decided and why. */
  note?: string;
}

export interface ReconItem {
  status: ReconStatus;
  /** "out": the account paid. "in": the account received. */
  direction: Direction;
  instruction?: PayoutInstruction & { PmtInfId: string };
  transfer?: TransferObservation;
  /** Present on matched / mismatch items: what tied the two sides together. */
  evidence?: Evidence;
  /** The after-the-fact reference that supplied the link, when evidence is "reference". */
  reference?: ReferenceObservation;
  /** Chain amount minus ledger amount, in 6-decimal units. Negative = short-paid, positive = over-paid. */
  varianceUnits?: bigint;
  /** Ambiguous entry: the transfers it could be. Ambiguous transfer: the entries it could settle. */
  candidates?: TransferObservation[];
  candidateIds?: string[];
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
  /** closing - expectedClosing in 6-decimal units. Zero means every movement is explained. */
  unexplained: bigint;
  /** USDC only, when the scan read native balances: the same difference exact to the wei. */
  unexplainedWei?: bigint;
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
  /** Trusted references that name a transaction outside the scanned range, or an EndToEndId not in the ledger. */
  danglingReferences: Array<{ EndToEndId: string; TxHash: Hex; sender: Address; reason: "tx_not_in_scan" | "unknown_id" }>;
  summary: Record<ReconStatus, number> & {
    expectedUnits: bigint;
    settledUnits: bigint;
    exceptionUnits: bigint;
    /** Of the expected/settled totals, how much is receivable (direction "in"). */
    expectedInUnits: bigint;
    settledInUnits: bigint;
    /** Settled items by evidence strength. */
    byEvidence: Record<Evidence, number>;
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
  /**
   * Only references published by these EOAs are trusted. Defaults to the
   * account itself plus every sender present in activity.references (i.e.
   * whoever the caller chose to read memos from).
   */
  trustedReferenceSigners?: Address[];
  /** Human decisions for pairings the engine would not make on its own. Applied after references, before intent. */
  decisions?: Decision[];
  now?: Date;
}

/** Address comparison that ignores checksum casing. */
function same(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

const EXCEPTIONS: ReconStatus[] = ["mismatch", "ambiguous", "duplicate", "unexpected", "missing"];

export function isException(status: ReconStatus): boolean {
  return EXCEPTIONS.includes(status);
}

function varianceNote(transfer: TransferObservation, ledgerUnits: bigint): string | undefined {
  const diff = transfer.amount - ledgerUnits;
  if (diff === 0n) return undefined;
  const label = diff < 0n ? "Short-paid" : "Over-paid";
  return `${label} by ${fromUnits(diff < 0n ? -diff : diff)}: chain ${fromUnits(transfer.amount)} vs ledger ${fromUnits(ledgerUnits)}`;
}

type Entry = PayoutInstruction & { PmtInfId: string };

/**
 * Matches an account's on-chain activity against its own ledger, in both
 * directions, with three strengths of evidence.
 *
 * Pass 1, memos: a transfer whose memo carries a known EndToEndId is
 * compared field by field with that ledger entry.
 * Pass 2, references: a transfer with no memo of its own, whose transaction
 * is named by an after-the-fact reference memo from a trusted EOA, is
 * compared the same way. This is how payments from Safes, custodians and
 * plain wallet sends get first-class evidence.
 * Pass 3, intent: remaining entries are paired with remaining transfers on
 * counterparty, token and amount, but only when the pairing is unique in
 * both directions. Anything with more than one plausible pairing is
 * reported as ambiguous and left for a person, never guessed.
 * Whatever is left becomes "missing" (ledger side) or "unexpected" (chain side).
 *
 * With no runs at all (statement mode) every transfer is "unexpected": the
 * report is then a plain statement of the wallet with a roll-forward, still
 * useful to book to suspense or to export as camt.054.
 */
export function reconcile(runs: LedgerRun[], activity: AccountActivity, options: ReconcileOptions = {}): ReconReport {
  const account = getAddress(activity.account);
  const entries: Entry[] = runs.flatMap((run) => run.instructions.map((i) => ({ ...normalizeInstruction(i), PmtInfId: run.PmtInfId })));
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
  const inScope = [...outgoing, ...incoming];

  const items: ReconItem[] = [];
  const settled = new Set<string>();
  const claimed = new Set<TransferObservation>();
  const directionOf = (t: TransferObservation): Direction => (same(t.from, account) ? "out" : "in");

  /** Field-by-field comparison once a transfer has been tied to an entry by memo or reference. */
  function compare(entry: Entry, transfer: TransferObservation): string[] {
    const direction = directionOf(transfer);
    const notes: string[] = [];
    if (entry.direction !== direction) {
      notes.push(`Ledger expects money ${entry.direction === "in" ? "in" : "out"} but this transfer went ${direction}`);
    } else if (direction === "out") {
      if (!same(transfer.to, entry.recipient)) notes.push(`Recipient ${transfer.to} differs from ledger ${entry.recipient}`);
    } else if (entry.payer && !same(transfer.from, entry.payer)) {
      notes.push(`Payer ${transfer.from} differs from ledger ${entry.payer}`);
    }
    const variance = varianceNote(transfer, toUnits(entry.amount));
    if (variance) notes.push(variance);
    if (transfer.token !== entry.token) notes.push(`Token ${transfer.token} differs from ledger ${entry.token}`);
    return notes;
  }

  /** Differences that are worth saying but do not change what was paid: the batch label on the memo vs the ledger file. */
  function softNotes(entry: Entry, memoRun: string | undefined): string[] {
    return memoRun && memoRun !== entry.PmtInfId ? [`Memo names run ${memoRun} (informational: the ledger files this entry under ${entry.PmtInfId})`] : [];
  }

  function settle(entry: Entry, transfer: TransferObservation, evidence: Evidence, memoRun: string | undefined, reference?: ReferenceObservation) {
    claimed.add(transfer);
    const direction = directionOf(transfer);
    if (settled.has(entry.EndToEndId)) {
      items.push({ status: "duplicate", direction, instruction: entry, transfer, evidence, reference, notes: ["EndToEndId was already settled"] });
      return;
    }
    settled.add(entry.EndToEndId);
    const notes = compare(entry, transfer);
    const status: ReconStatus = notes.length ? "mismatch" : "matched";
    notes.push(...softNotes(entry, memoRun));
    if (reference) notes.push(`Reference published after the fact by ${reference.sender} in ${reference.txHash}`);
    items.push({
      status,
      direction,
      instruction: entry,
      transfer,
      evidence,
      reference,
      varianceUnits: transfer.amount - toUnits(entry.amount),
      notes,
    });
  }

  // Pass 1: memo-linked transfers.
  for (const transfer of inScope) {
    const memo = transfer.memo?.decoded;
    if (memo?.kind !== "payment") continue;
    const entry = byId.get(memo.memo.EndToEndId);
    if (!entry) continue;
    settle(entry, transfer, "memo", memo.memo.PmtInfId);
  }

  // Pass 2: references published after the fact, from trusted EOAs only.
  const trusted = new Set((options.trustedReferenceSigners ?? [account, ...activity.references.map((r) => r.sender)]).map((a) => a.toLowerCase()));
  const refsByTx = new Map<string, ReferenceObservation[]>();
  for (const r of activity.references) {
    if (!trusted.has(r.sender.toLowerCase())) continue;
    const list = refsByTx.get(r.reference.TxHash.toLowerCase()) ?? [];
    list.push(r);
    refsByTx.set(r.reference.TxHash.toLowerCase(), list);
  }
  const usedRefs = new Set<ReferenceObservation>();
  const txsInScope = new Set(inScope.map((t) => t.txHash.toLowerCase()));
  const danglingReferences: ReconReport["danglingReferences"] = [];
  for (const list of refsByTx.values()) {
    for (const r of list) {
      if (!byId.has(r.reference.EndToEndId)) danglingReferences.push({ EndToEndId: r.reference.EndToEndId, TxHash: r.reference.TxHash, sender: r.sender, reason: "unknown_id" });
      else if (!txsInScope.has(r.reference.TxHash.toLowerCase())) danglingReferences.push({ EndToEndId: r.reference.EndToEndId, TxHash: r.reference.TxHash, sender: r.sender, reason: "tx_not_in_scan" });
    }
  }
  for (const transfer of inScope) {
    if (claimed.has(transfer) || transfer.memo?.decoded.kind === "payment") continue;
    const refs = (refsByTx.get(transfer.txHash.toLowerCase()) ?? []).filter((r) => !usedRefs.has(r) && byId.has(r.reference.EndToEndId));
    if (refs.length === 0) continue;
    // Several references can name one transaction (a Safe batch). Pick the one whose entry fits this transfer.
    const fitting = refs.filter((r) => compare(byId.get(r.reference.EndToEndId)!, transfer).length === 0);
    const chosen = fitting[0] ?? (refs.length === 1 ? refs[0] : undefined);
    if (!chosen) continue;
    usedRefs.add(chosen);
    settle(byId.get(chosen.reference.EndToEndId)!, transfer, "reference", chosen.reference.PmtInfId, chosen);
  }

  // Pass 2b: recorded human decisions. Compared field by field like everything else, so a wrong decision shows as a mismatch, never as silence.
  for (const d of options.decisions ?? []) {
    const entry = byId.get(d.EndToEndId);
    const transfer = inScope.find((t) => t.txHash.toLowerCase() === d.txHash.toLowerCase() && t.logIndex === d.logIndex);
    if (!entry || !transfer || claimed.has(transfer) || settled.has(entry.EndToEndId)) continue;
    settle(entry, transfer, "manual", undefined);
    items[items.length - 1]!.notes.push(d.note ? `Settled by hand: ${d.note}` : "Settled by hand");
  }

  // Pass 3: intent matching, unique in both directions.
  const firstMatched = items
    .filter((i) => i.transfer)
    .reduce<number | undefined>((min, i) => (min === undefined || i.transfer!.timestamp < min ? i.transfer!.timestamp : min), undefined);
  const inWindow = (t: TransferObservation) =>
    options.intentWindowSeconds === undefined || firstMatched === undefined || Math.abs(t.timestamp - firstMatched) <= options.intentWindowSeconds;
  const pool = inScope.filter((t) => !claimed.has(t) && t.memo?.decoded.kind !== "payment");
  const open = entries.filter((e) => !settled.has(e.EndToEndId));
  const fits = (entry: Entry, t: TransferObservation) => {
    if (t.token !== entry.token || t.amount !== toUnits(entry.amount) || !inWindow(t)) return false;
    if (entry.direction === "out") return directionOf(t) === "out" && same(t.to, entry.recipient);
    return directionOf(t) === "in" && (!entry.payer || same(t.from, entry.payer));
  };
  const candidatesOf = new Map<string, TransferObservation[]>(open.map((e) => [e.EndToEndId, pool.filter((t) => fits(e, t))]));
  const entriesFor = new Map<TransferObservation, Entry[]>();
  for (const e of open) for (const t of candidatesOf.get(e.EndToEndId)!) entriesFor.set(t, [...(entriesFor.get(t) ?? []), e]);

  const held = new Set<TransferObservation>();
  for (const entry of open) {
    const candidates = candidatesOf.get(entry.EndToEndId)!;
    if (candidates.length === 0) continue;
    const unique = candidates.length === 1 && entriesFor.get(candidates[0]!)!.length === 1;
    if (unique) {
      const t = candidates[0]!;
      claimed.add(t);
      settled.add(entry.EndToEndId);
      const how = entry.direction === "out" ? "recipient, token and amount" : entry.payer ? "payer, token and amount" : "token and amount";
      items.push({
        status: "matched_by_intent",
        direction: entry.direction!,
        instruction: entry,
        transfer: t,
        evidence: "intent",
        varianceUnits: 0n,
        notes: [`No memo on this transfer; matched on ${how}, the only possible pairing${t.native ? " (native USDC transfer)" : ""}`],
      });
      continue;
    }
    for (const t of candidates) held.add(t);
    const rivals = [...new Set(candidates.flatMap((t) => entriesFor.get(t)!.map((e) => e.EndToEndId)))].filter((id) => id !== entry.EndToEndId);
    items.push({
      status: "ambiguous",
      direction: entry.direction!,
      instruction: entry,
      candidates,
      notes: [
        `${candidates.length} transfer${candidates.length === 1 ? "" : "s"} could settle this entry` +
          (rivals.length ? `, and ${rivals.length === 1 ? "entry" : "entries"} ${rivals.join(", ")} could claim the same money` : ""),
        "No memo to decide. Attach references or settle by hand.",
      ],
    });
  }
  for (const t of held) {
    if (claimed.has(t)) continue;
    claimed.add(t);
    const ids = entriesFor.get(t)!.map((e) => e.EndToEndId);
    items.push({
      status: "ambiguous",
      direction: directionOf(t),
      transfer: t,
      candidateIds: ids,
      notes: [`Could settle ${ids.join(" or ")}; held until a person decides`],
    });
  }

  for (const entry of entries) {
    if (settled.has(entry.EndToEndId) || candidatesOf.get(entry.EndToEndId)?.length) continue;
    items.push({
      status: "missing",
      direction: entry.direction!,
      instruction: entry,
      notes: [entry.direction === "in" ? "No incoming transfer found for this receivable" : "No transfer found for this ledger entry"],
    });
  }
  for (const transfer of inScope) {
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
    ambiguous: 0,
    missing: 0,
    duplicate: 0,
    unexpected: 0,
    expectedUnits: entries.reduce((s, e) => s + toUnits(e.amount), 0n),
    settledUnits: 0n,
    exceptionUnits: 0n,
    expectedInUnits: entries.filter((e) => e.direction === "in").reduce((s, e) => s + toUnits(e.amount), 0n),
    settledInUnits: 0n,
    byEvidence: { memo: 0, reference: 0, manual: 0, intent: 0 },
  };
  for (const item of items) {
    // Ambiguous transfers are counted through their entries, not twice.
    if (!(item.status === "ambiguous" && !item.instruction)) summary[item.status] += 1;
    if (!item.transfer) continue;
    const cleared = item.status === "matched" || item.status === "matched_by_intent";
    if (cleared) {
      summary.settledUnits += item.transfer.amount;
      if (item.direction === "in") summary.settledInUnits += item.transfer.amount;
      if (item.evidence) summary.byEvidence[item.evidence] += 1;
    } else summary.exceptionUnits += item.transfer.amount;
  }

  const feesWei = activity.fees.reduce((s, f) => s + f.feeWei, 0n);
  const rollForward = activity.balances?.map((b): BalanceRollForward => {
    const ins = incomingAll.filter((t) => t.token === b.token);
    const outs = outgoing.filter((t) => t.token === b.token);
    const inflow = ins.reduce((s, t) => s + t.amount, 0n);
    const outflow = outs.reduce((s, t) => s + t.amount, 0n);
    const fees = b.token === "USDC" ? feesWei / NATIVE_TO_UNITS : 0n;
    if (b.token === "USDC" && b.openingWei !== undefined && b.closingWei !== undefined) {
      // Exact in wei: ERC-20 amounts are whole micro-dollars, native sends keep their 18-decimal value, fees are wei.
      const wei = (t: TransferObservation) => t.amountWei ?? t.amount * NATIVE_TO_UNITS;
      const expectedWei = b.openingWei + ins.reduce((s, t) => s + wei(t), 0n) - outs.reduce((s, t) => s + wei(t), 0n) - feesWei;
      const unexplainedWei = b.closingWei - expectedWei;
      const floorDiv = (x: bigint) => (x < 0n ? -((-x) / NATIVE_TO_UNITS) : x / NATIVE_TO_UNITS);
      return { token: b.token, opening: b.opening, inflow, outflow, fees, expectedClosing: expectedWei / NATIVE_TO_UNITS, closing: b.closing, unexplained: floorDiv(unexplainedWei), unexplainedWei };
    }
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
    danglingReferences: danglingReferences.sort((a, b) => a.EndToEndId.localeCompare(b.EndToEndId)),
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
  ambiguous: 1,
  duplicate: 2,
  unexpected: 3,
  missing: 4,
  matched_by_intent: 5,
  matched: 6,
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
