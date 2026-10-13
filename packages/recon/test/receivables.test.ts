import { describe, expect, it } from "vitest";
import { type Address, type Hex } from "viem";
import { paymentMemoId, toUnits, type AccountActivity, type PayoutInstruction, type TransferObservation } from "@tieout/sdk";
import { buildJournal, camt054Xml, qboJournalCsv, reconcile } from "@tieout/recon";

const ME = "0x00000000000000000000000000000000000000ee" as Address;
const addr = (n: number) => `0x${n.toString(16).padStart(40, "0")}` as Address;
const tx = (n: number) => `0x${n.toString(16).padStart(64, "0")}` as Hex;

let logIndex = 0;
function transfer(from: Address, to: Address, amount: string, opts: { memo?: string; native?: boolean; txn?: number; ts?: number } = {}): TransferObservation {
  return {
    txHash: tx(opts.txn ?? 1),
    blockNumber: 100n,
    timestamp: opts.ts ?? 1_760_000_000,
    logIndex: logIndex++,
    token: "USDC",
    from,
    to,
    amount: toUnits(amount),
    native: opts.native,
    amountWei: opts.native ? toUnits(amount) * 10n ** 12n : undefined,
    memo: opts.memo
      ? { memoId: paymentMemoId(opts.memo), memoIndex: BigInt(logIndex), decoded: { kind: "payment", memo: { EndToEndId: opts.memo, PmtInfId: "INV" } } }
      : undefined,
  };
}

function activity(transfers: TransferObservation[], balances?: AccountActivity["balances"]): AccountActivity {
  return { network: "arc-testnet", account: ME, fromBlock: 0n, toBlock: 200n, transfers, anchors: [], references: [], fees: [], balances };
}

const receivables: PayoutInstruction[] = [
  { EndToEndId: "INV-1", direction: "in", recipient: ME, payer: addr(1), amount: "100.00", token: "USDC" },
  { EndToEndId: "INV-2", direction: "in", recipient: ME, amount: "40.00", token: "USDC" },
  { EndToEndId: "INV-3", direction: "in", recipient: ME, amount: "55.00", token: "USDC" },
];

describe("receivables", () => {
  const chain = [
    transfer(addr(1), ME, "100.00", { memo: "INV-1" }), // memo'd receipt
    transfer(addr(7), ME, "40.00", { native: true, txn: 2 }), // wallet "send", no memo, any payer
    transfer(addr(9), ME, "3.00", { txn: 3 }), // unexplained receipt
    transfer(ME, addr(2), "5.00", { txn: 4 }), // unexplained payout
  ];
  const report = reconcile([{ PmtInfId: "INV", instructions: receivables }], activity(chain));
  const byId = (id: string) => report.items.find((i) => i.instruction?.EndToEndId === id)!;

  it("matches incoming transfers by memo and by intent, including native sends", () => {
    expect(byId("INV-1")).toMatchObject({ status: "matched", direction: "in" });
    expect(byId("INV-2")).toMatchObject({ status: "matched_by_intent", direction: "in" });
    expect(byId("INV-2").notes[0]).toContain("native");
    expect(byId("INV-3")).toMatchObject({ status: "missing", direction: "in" });
    const unexpected = report.items.filter((i) => i.status === "unexpected");
    expect(unexpected.map((i) => i.direction).sort()).toEqual(["in", "out"]);
    expect(report.summary.settledInUnits).toBe(toUnits("140"));
    expect(report.ignoredIncoming.count).toBe(0);
  });

  it("books receipts against receivables and keeps the wallet account true to the chain", () => {
    const entries = buildJournal(report, []);
    const inv1 = entries.find((e) => e.reference === "INV-1")!;
    expect(inv1.lines[0]!).toMatchObject({ account: "1015", debit: "100" });
    expect(inv1.lines[1]!).toMatchObject({ account: "1210", credit: "100" });
    const stray = entries.find((e) => e.status === "unexpected" && e.narration.includes("receipt"))!;
    expect(stray.lines[0]!.account).toBe("1015");
    expect(stray.lines[1]!.account).toBe("1999");
    for (const e of entries) {
      const d = e.lines.reduce((s, l) => s + Number(l.debit), 0);
      const c = e.lines.reduce((s, l) => s + Number(l.credit), 0);
      expect(d).toBeCloseTo(c, 9);
    }
  });

  it("ignores incoming transfers when the ledger has no receivables", () => {
    const payouts: PayoutInstruction[] = [{ EndToEndId: "P-1", recipient: addr(2), amount: "5.00", token: "USDC" }];
    const r = reconcile([{ PmtInfId: "RUN", instructions: payouts }], activity(chain));
    expect(r.items.map((i) => i.status)).toEqual(["matched_by_intent"]);
    expect(r.ignoredIncoming).toEqual({ count: 3, units: toUnits("143") });
    const forced = reconcile([{ PmtInfId: "RUN", instructions: payouts }], activity(chain), { incoming: "reconcile" });
    expect(forced.items.filter((i) => i.status === "unexpected" && i.direction === "in")).toHaveLength(3);
  });

  it("flags direction mismatches when a memo points the wrong way", () => {
    const r = reconcile([{ PmtInfId: "INV", instructions: receivables.slice(0, 1) }], activity([transfer(ME, addr(1), "100.00", { memo: "INV-1" })]));
    expect(r.items[0]).toMatchObject({ status: "mismatch", direction: "out" });
    expect(r.items[0]!.notes[0]).toContain("money in");
  });
});

describe("variance and roll-forward", () => {
  it("reports short and over payments with the exact difference", () => {
    const ledger: PayoutInstruction[] = [
      { EndToEndId: "A", recipient: addr(1), amount: "10.00", token: "USDC" },
      { EndToEndId: "B", recipient: addr(2), amount: "10.00", token: "USDC" },
    ];
    const r = reconcile([{ PmtInfId: "R", instructions: ledger }], activity([transfer(ME, addr(1), "9.95", { memo: "A" }), transfer(ME, addr(2), "10.50", { memo: "B" })]));
    const a = r.items.find((i) => i.instruction?.EndToEndId === "A")!;
    const b = r.items.find((i) => i.instruction?.EndToEndId === "B")!;
    expect(a.status).toBe("mismatch");
    expect(a.varianceUnits).toBe(-50_000n);
    expect(a.notes[0]).toMatch(/^Short-paid by 0\.05/);
    expect(b.varianceUnits).toBe(500_000n);
    expect(b.notes[0]).toMatch(/^Over-paid by 0\.5/);
  });

  it("rolls the balance forward and surfaces unexplained movement", () => {
    const ledger: PayoutInstruction[] = [{ EndToEndId: "A", recipient: addr(1), amount: "10.00", token: "USDC" }];
    const act = activity([transfer(ME, addr(1), "10.00", { memo: "A" }), transfer(addr(5), ME, "2.00", { txn: 2 })], [
      { token: "USDC", opening: toUnits("50"), closing: toUnits("41.5") },
      { token: "EURC", opening: 0n, closing: 0n },
    ]);
    act.fees = [{ txHash: tx(1), blockNumber: 100n, timestamp: 1_760_000_000, from: ME, feeWei: toUnits("0.5") * 10n ** 12n }];
    const r = reconcile([{ PmtInfId: "R", instructions: ledger }], act);
    const usdc = r.rollForward!.find((b) => b.token === "USDC")!;
    expect(usdc).toMatchObject({ opening: toUnits("50"), inflow: toUnits("2"), outflow: toUnits("10"), fees: toUnits("0.5"), expectedClosing: toUnits("41.5"), unexplained: 0n });
    act.balances![0]!.closing = toUnits("40");
    expect(reconcile([{ PmtInfId: "R", instructions: ledger }], act).rollForward![0]!.unexplained).toBe(toUnits("-1.5"));
  });
});

describe("exports", () => {
  const ledger: PayoutInstruction[] = [
    { EndToEndId: "P-1", recipient: addr(1), amount: "10.00", token: "USDC", Purp: "COMM", CdtrRef: "STMT-1", payeeName: "Ana" },
    { EndToEndId: "INV-1", direction: "in", recipient: ME, amount: "25.00", token: "USDC" },
  ];
  const report = reconcile([{ PmtInfId: "INV", instructions: ledger }], activity([transfer(ME, addr(1), "10.00", { memo: "P-1" }), transfer(addr(3), ME, "25.00", { txn: 2 })]));

  it("writes a camt.054 notification with ISO references", () => {
    const xml = camt054Xml(report, { msgId: "MSG1", ownerName: "PromptBazaar" });
    expect(xml).toContain('<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.054.001.08">');
    expect(xml).toContain("<EndToEndId>P-1</EndToEndId>");
    expect(xml).toContain("<CdtrRefInf><Ref>STMT-1</Ref></CdtrRefInf>");
    expect(xml).toContain("<Purp><Cd>COMM</Cd></Purp>");
    expect(xml).toContain('<Amt Ccy="USD">25</Amt><CdtDbtInd>CRDT</CdtDbtInd>');
    expect(xml).toContain("<TtlCdtNtries><NbOfNtries>1</NbOfNtries><Sum>25</Sum></TtlCdtNtries>");
    expect(xml).toContain("<TtlDbtNtries><NbOfNtries>1</NbOfNtries><Sum>10</Sum></TtlDbtNtries>");
    expect(xml).toContain(`<AcctSvcrRef>${tx(1)}</AcctSvcrRef>`);
  });

  it("writes a balanced QuickBooks journal with account names and US dates", () => {
    const csv = qboJournalCsv(buildJournal(report, []));
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("*JournalNo,*JournalDate,*AccountName,Debits,Credits,Description,Name,Currency");
    expect(lines.some((l) => l.startsWith("P-1,10/09/2025,Payouts payable,10.00,,"))).toBe(true);
    expect(lines.some((l) => l.startsWith("P-1,10/09/2025,USDC wallet (Arc),,10.00,"))).toBe(true);
    expect(lines.some((l) => l.startsWith("INV-1,10/09/2025,USDC wallet (Arc),25.00,,"))).toBe(true);
  });
});
