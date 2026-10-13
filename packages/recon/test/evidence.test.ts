import { describe, expect, it } from "vitest";
import { type Address, type Hex } from "viem";
import { paymentMemoId, toUnits, type AccountActivity, type PayoutInstruction, type ReferenceObservation, type TransferObservation } from "@tieout/sdk";
import { buildJournal, reconcile } from "@tieout/recon";

const ME = "0x00000000000000000000000000000000000000ee" as Address;
const OPS = "0x0000000000000000000000000000000000000099" as Address;
const addr = (n: number) => `0x${n.toString(16).padStart(40, "0")}` as Address;
const tx = (n: number) => `0x${n.toString(16).padStart(64, "0")}` as Hex;

let logIndex = 0;
function transfer(from: Address, to: Address, amount: string, opts: { memo?: string; txn?: number } = {}): TransferObservation {
  return {
    txHash: tx(opts.txn ?? 1),
    blockNumber: 100n,
    timestamp: 1_760_000_000,
    logIndex: logIndex++,
    token: "USDC",
    from,
    to,
    amount: toUnits(amount),
    memo: opts.memo
      ? { memoId: paymentMemoId(opts.memo), memoIndex: BigInt(logIndex), decoded: { kind: "payment", memo: { EndToEndId: opts.memo, PmtInfId: "R" } } }
      : undefined,
  };
}

function reference(sender: Address, EndToEndId: string, forTx: Hex, txn = 50): ReferenceObservation {
  return { txHash: tx(txn), blockNumber: 120n, timestamp: 1_760_000_500, sender, memoId: paymentMemoId(EndToEndId), reference: { EndToEndId, TxHash: forTx, PmtInfId: "R" } };
}

function activity(transfers: TransferObservation[], references: ReferenceObservation[] = []): AccountActivity {
  return { network: "arc-testnet", account: ME, fromBlock: 0n, toBlock: 200n, transfers, anchors: [], references, fees: [] };
}

describe("references published after the fact", () => {
  const ledger: PayoutInstruction[] = [
    { EndToEndId: "R-1", recipient: addr(1), amount: "10.00", token: "USDC" },
    { EndToEndId: "R-2", recipient: addr(2), amount: "20.00", token: "USDC" },
  ];
  // A Safe paid both in one batch with no memos; the ops wallet published references naming that transaction.
  const chain = [transfer(ME, addr(1), "10.00", { txn: 7 }), transfer(ME, addr(2), "20.00", { txn: 7 })];

  it("upgrades memo-less transfers to matched when a trusted reference names their transaction", () => {
    const r = reconcile([{ PmtInfId: "R", instructions: ledger }], activity(chain, [reference(OPS, "R-1", tx(7)), reference(OPS, "R-2", tx(7), 51)]));
    const one = r.items.find((i) => i.instruction?.EndToEndId === "R-1")!;
    const two = r.items.find((i) => i.instruction?.EndToEndId === "R-2")!;
    expect(one).toMatchObject({ status: "matched", evidence: "reference" });
    expect(one.reference?.sender).toBe(OPS);
    expect(one.transfer?.to).toBe(addr(1));
    expect(two).toMatchObject({ status: "matched", evidence: "reference" });
    expect(r.summary.byEvidence).toEqual({ memo: 0, reference: 2, manual: 0, intent: 0 });
  });

  it("ignores references from untrusted signers", () => {
    const r = reconcile([{ PmtInfId: "R", instructions: ledger }], activity(chain, [reference(OPS, "R-1", tx(7))]), { trustedReferenceSigners: [ME] });
    expect(r.items.filter((i) => i.evidence === "reference")).toHaveLength(0);
    expect(r.items.filter((i) => i.status === "matched_by_intent")).toHaveLength(2);
  });

  it("reports a mismatch when the referenced transfer disagrees with the ledger", () => {
    const r = reconcile([{ PmtInfId: "R", instructions: ledger.slice(0, 1) }], activity([transfer(ME, addr(1), "9.00", { txn: 7 })], [reference(OPS, "R-1", tx(7))]));
    expect(r.items[0]).toMatchObject({ status: "mismatch", evidence: "reference" });
    expect(r.items[0]!.notes[0]).toMatch(/^Short-paid/);
  });
});

describe("ambiguity is never guessed", () => {
  const ledger: PayoutInstruction[] = [
    { EndToEndId: "A-1", recipient: addr(1), amount: "5.00", token: "USDC" },
    { EndToEndId: "A-2", recipient: addr(1), amount: "5.00", token: "USDC" },
    { EndToEndId: "A-3", recipient: addr(3), amount: "7.00", token: "USDC" },
  ];

  it("holds entries and transfers that could pair more than one way", () => {
    const chain = [transfer(ME, addr(1), "5.00", { txn: 2 }), transfer(ME, addr(1), "5.00", { txn: 3 }), transfer(ME, addr(3), "7.00", { txn: 4 })];
    const r = reconcile([{ PmtInfId: "R", instructions: ledger }], activity(chain));
    const a1 = r.items.find((i) => i.instruction?.EndToEndId === "A-1")!;
    expect(a1.status).toBe("ambiguous");
    expect(a1.candidates).toHaveLength(2);
    expect(a1.notes[0]).toContain("A-2 could claim the same money");
    const heldTransfers = r.items.filter((i) => i.status === "ambiguous" && !i.instruction);
    expect(heldTransfers).toHaveLength(2);
    expect(heldTransfers[0]!.candidateIds).toEqual(["A-1", "A-2"]);
    expect(r.items.find((i) => i.instruction?.EndToEndId === "A-3")!.status).toBe("matched_by_intent");
    expect(r.summary.ambiguous).toBe(2);
    expect(r.items.filter((i) => i.status === "unexpected")).toHaveLength(0);
  });

  it("books held transfers to suspense exactly once", () => {
    const chain = [transfer(ME, addr(1), "5.00", { txn: 2 }), transfer(ME, addr(1), "5.00", { txn: 3 })];
    const r = reconcile([{ PmtInfId: "R", instructions: ledger.slice(0, 2) }], activity(chain));
    const entries = buildJournal(r, []);
    expect(entries).toHaveLength(2);
    for (const e of entries) expect(e.lines[0]!.account).toBe("1999");
  });

  it("still settles when one entry has a single candidate that fits nothing else", () => {
    const chain = [transfer(ME, addr(1), "5.00", { txn: 2 })];
    const r = reconcile([{ PmtInfId: "R", instructions: ledger.slice(0, 2) }], activity(chain));
    // One transfer, two entries that both fit it: ambiguous for both, transfer held.
    expect(r.items.filter((i) => i.status === "ambiguous" && i.instruction)).toHaveLength(2);
    expect(r.items.filter((i) => i.status === "missing")).toHaveLength(0);
  });
});

describe("human decisions and statement mode", () => {
  const ledger: PayoutInstruction[] = [
    { EndToEndId: "A-1", recipient: addr(1), amount: "5.00", token: "USDC" },
    { EndToEndId: "A-2", recipient: addr(1), amount: "5.00", token: "USDC" },
  ];
  const chain = [transfer(ME, addr(1), "5.00", { txn: 2 }), transfer(ME, addr(1), "5.00", { txn: 3 })];

  it("settles an ambiguous pairing by recorded decision, then the rest resolves by intent", () => {
    const first = chain[0]!;
    const r = reconcile([{ PmtInfId: "R", instructions: ledger }], activity(chain), {
      decisions: [{ EndToEndId: "A-2", txHash: first.txHash, logIndex: first.logIndex, note: "invoice date matches" }],
    });
    const a2 = r.items.find((i) => i.instruction?.EndToEndId === "A-2")!;
    expect(a2).toMatchObject({ status: "matched", evidence: "manual" });
    expect(a2.notes.at(-1)).toBe("Settled by hand: invoice date matches");
    expect(r.items.find((i) => i.instruction?.EndToEndId === "A-1")).toMatchObject({ status: "matched_by_intent" });
    expect(r.summary.ambiguous).toBe(0);
    expect(r.summary.byEvidence.manual).toBe(1);
  });

  it("flags a wrong decision as a mismatch instead of accepting it silently", () => {
    const wrong = transfer(ME, addr(9), "1.00", { txn: 4 });
    const r = reconcile([{ PmtInfId: "R", instructions: ledger.slice(0, 1) }], activity([wrong]), {
      decisions: [{ EndToEndId: "A-1", txHash: wrong.txHash, logIndex: wrong.logIndex }],
    });
    expect(r.items[0]).toMatchObject({ status: "mismatch", evidence: "manual" });
  });

  it("produces a statement when there is no ledger at all", () => {
    const r = reconcile([], activity([...chain, transfer(addr(5), ME, "2.00", { txn: 7 })]), { incoming: "reconcile" });
    expect(r.items.every((i) => i.status === "unexpected")).toBe(true);
    expect(r.items.filter((i) => i.direction === "in")).toHaveLength(1);
    expect(r.summary.exceptionUnits).toBe(toUnits("12"));
    expect(buildJournal(r, [])).toHaveLength(3);
  });
});


describe("soft notes and dangling references", () => {
  const ledger: PayoutInstruction[] = [{ EndToEndId: "R-1", recipient: addr(1), amount: "10.00", token: "USDC" }];

  it("notes a different run id on the memo without failing the match", () => {
    const t = transfer(ME, addr(1), "10.00", { memo: "R-1" }); // memo says run "R"
    const r = reconcile([{ PmtInfId: "OTHER-RUN", instructions: ledger }], activity([t]));
    expect(r.items[0]).toMatchObject({ status: "matched", evidence: "memo" });
    expect(r.items[0]!.notes[0]).toContain("Memo names run R");
  });

  it("reports trusted references that point outside the scan or at unknown ids", () => {
    const r = reconcile([{ PmtInfId: "R", instructions: ledger }], activity([transfer(ME, addr(1), "10.00", { txn: 2 })], [
      reference(OPS, "R-1", tx(77)), // transaction not in the scan
      reference(OPS, "NOPE", tx(2), 51), // id not in the ledger
    ]));
    expect(r.danglingReferences).toEqual([
      expect.objectContaining({ EndToEndId: "NOPE", reason: "unknown_id" }),
      expect.objectContaining({ EndToEndId: "R-1", reason: "tx_not_in_scan" }),
    ]);
    expect(r.items[0]).toMatchObject({ status: "matched_by_intent" });
  });
});
