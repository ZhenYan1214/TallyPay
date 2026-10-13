import { describe, expect, it } from "vitest";
import { type Address, type Hex } from "viem";
import {
  controlSum,
  ledgerHash,
  paymentMemoId,
  toUnits,
  type AccountActivity,
  type PayoutInstruction,
  type TransferObservation,
} from "@tieout/sdk";
import { buildJournal, journalCsv, reconcile, xeroManualJournalCsv } from "@tieout/recon";

const PAYER = "0x00000000000000000000000000000000000000Ff" as Address;
const addr = (n: number) => `0x${n.toString(16).padStart(40, "0")}` as Address;
const tx = (n: number) => `0x${n.toString(16).padStart(64, "0")}` as Hex;

const ledger: PayoutInstruction[] = [
  { EndToEndId: "RUN-1-001", recipient: addr(1), amount: "10.00", token: "USDC", payeeName: "Ana" },
  { EndToEndId: "RUN-1-002", recipient: addr(2), amount: "20.00", token: "USDC" },
  { EndToEndId: "RUN-1-003", recipient: addr(3), amount: "30.00", token: "USDC" },
  { EndToEndId: "RUN-1-004", recipient: addr(4), amount: "40.00", token: "USDC" },
  { EndToEndId: "RUN-1-005", recipient: addr(5), amount: "50.00", token: "USDC" },
];

let logIndex = 0;
function transfer(to: Address, amount: string, endToEndId?: string, txn = 1): TransferObservation {
  return {
    txHash: tx(txn),
    blockNumber: 100n,
    timestamp: 1_760_000_000,
    logIndex: logIndex++,
    token: "USDC",
    from: PAYER,
    to,
    amount: toUnits(amount),
    memo: endToEndId
      ? {
          memoId: paymentMemoId(endToEndId),
          memoIndex: BigInt(logIndex),
          decoded: { kind: "payment", memo: { EndToEndId: endToEndId, PmtInfId: "RUN-1" } },
        }
      : undefined,
  };
}

function activity(transfers: TransferObservation[], anchorHash = ledgerHash(ledger)): AccountActivity {
  return {
    network: "arc-testnet",
    account: PAYER,
    fromBlock: 0n,
    toBlock: 200n,
    transfers,
    anchors: [
      {
        txHash: tx(1),
        blockNumber: 100n,
        timestamp: 1_760_000_000,
        sender: PAYER,
        anchor: { PmtInfId: "RUN-1", NbOfTxs: 5, CtrlSum: controlSum(ledger), LedgerHash: anchorHash },
      },
    ],
    fees: [{ txHash: tx(1), blockNumber: 100n, timestamp: 1_760_000_000, from: PAYER, feeWei: 1_234_000_000_000_000n }],
  };
}

describe("reconcile", () => {
  const observed = [
    transfer(addr(1), "10.00", "RUN-1-001"), // matched
    transfer(addr(2), "21.00", "RUN-1-002"), // amount mismatch
    transfer(addr(3), "30.00", undefined, 2), // memo-less, matched by intent
    // RUN-1-004 never paid -> missing
    transfer(addr(5), "50.00", "RUN-1-005"), // matched
    transfer(addr(5), "50.00", "RUN-1-005"), // paid twice -> duplicate
    transfer(addr(9), "7.00", undefined, 3), // unexplained outflow
  ];
  const report = reconcile([{ PmtInfId: "RUN-1", instructions: ledger }], activity(observed));
  const statusOf = (id: string) => report.items.filter((i) => i.instruction?.EndToEndId === id).map((i) => i.status);

  it("classifies every item", () => {
    expect(statusOf("RUN-1-001")).toEqual(["matched"]);
    expect(statusOf("RUN-1-002")).toEqual(["mismatch"]);
    expect(statusOf("RUN-1-003")).toEqual(["matched_by_intent"]);
    expect(statusOf("RUN-1-004")).toEqual(["missing"]);
    expect(statusOf("RUN-1-005").sort()).toEqual(["duplicate", "matched"]);
    expect(report.items.filter((i) => i.status === "unexpected")).toHaveLength(1);
  });

  it("puts exceptions first and totals amounts", () => {
    expect(report.items[0]!.status).toBe("mismatch");
    expect(report.summary.expectedUnits).toBe(toUnits("150"));
    expect(report.summary.settledUnits).toBe(toUnits("90"));
    expect(report.summary.exceptionUnits).toBe(toUnits("78"));
  });

  it("verifies the anchor against the payments in its own transaction", () => {
    const paid = ledger.slice(0, 2);
    const chain = [transfer(addr(1), "10.00", "RUN-1-001"), transfer(addr(2), "20.00", "RUN-1-002")];
    const withAnchor = (a: AccountActivity): AccountActivity => ({
      ...a,
      anchors: [{ ...a.anchors[0]!, anchor: { PmtInfId: "RUN-1", NbOfTxs: 2, CtrlSum: controlSum(paid), LedgerHash: ledgerHash(paid) } }],
    });
    // Entries paid elsewhere or held back do not break the anchor.
    const ok = reconcile([{ PmtInfId: "RUN-1", instructions: ledger }], withAnchor(activity(chain)));
    expect(ok.anchors[0]!.status).toBe("verified");
    expect(ok.anchors[0]!.coveredIds).toEqual(["RUN-1-001", "RUN-1-002"]);

    // Editing a paid entry afterwards is pinpointed.
    const edited = ledger.map((i) => (i.EndToEndId === "RUN-1-002" ? { ...i, amount: "19.00" } : i));
    const tampered = reconcile([{ PmtInfId: "RUN-1", instructions: edited }], withAnchor(activity(chain)));
    expect(tampered.anchors[0]!.status).toBe("mismatch");
    expect(tampered.anchors[0]!.changedIds).toEqual(["RUN-1-002"]);
  });

  it("does not match by intent when amounts differ", () => {
    const r = reconcile([{ PmtInfId: "RUN-1", instructions: ledger.slice(0, 1) }], activity([transfer(addr(1), "10.01")]));
    expect(r.items.map((i) => i.status).sort()).toEqual(["missing", "unexpected"]);
  });
});

describe("journal", () => {
  const report = reconcile(
    [{ PmtInfId: "RUN-1", instructions: ledger.slice(0, 2) }],
    activity([transfer(addr(1), "10.00", "RUN-1-001"), transfer(addr(9), "5.00")]),
  );
  const entries = buildJournal(report, activity([]).fees);

  it("balances every entry", () => {
    for (const entry of entries) {
      const debit = entry.lines.reduce((s, l) => s + Number(l.debit), 0);
      const credit = entry.lines.reduce((s, l) => s + Number(l.credit), 0);
      expect(debit).toBeCloseTo(credit, 9);
    }
  });

  it("books cleared payouts to payables and exceptions to suspense", () => {
    const payout = entries.find((e) => e.reference === "RUN-1-001")!;
    expect(payout.lines[0]!.account).toBe("2110");
    const unexpected = entries.find((e) => e.status === "unexpected")!;
    expect(unexpected.lines[0]!.account).toBe("1999");
    const fee = entries.find((e) => e.status === "fee")!;
    expect(fee.lines[0]!.debit).toBe("0.001234");
  });

  it("exports CSV for review and for Xero", () => {
    expect(journalCsv(entries).split("\n")[0]).toContain("debit");
    const xero = xeroManualJournalCsv(entries);
    expect(xero).toContain("*Narration");
    expect(xero).toContain("-10.00");
  });

  it("keeps Xero lines balanced when rounding half cents", () => {
    const r = reconcile([{ PmtInfId: "RUN-1", instructions: [] }], activity([transfer(addr(9), "0.045")]));
    const rows = xeroManualJournalCsv(buildJournal(r, [])).trim().split("\n").slice(1);
    const amounts = rows.map((row) => row.split(",")[5]);
    expect(amounts).toEqual(["0.05", "-0.05"]);
  });
});
