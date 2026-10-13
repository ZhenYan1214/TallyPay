import { describe, expect, it } from "vitest";
import { decodeFunctionData, type Address } from "viem";
import {
  ARC_TESTNET,
  buildPayoutRun,
  decodeMemo,
  encodePaymentMemo,
  encodeRunAnchor,
  ledgerHash,
  memoAbi,
  multicall3FromAbi,
  paymentMemoId,
  type PayoutInstruction,
} from "@tallypay/sdk";

const A = "0x00000000000000000000000000000000000000a1" as Address;
const B = "0x00000000000000000000000000000000000000b2" as Address;
const PAYER = "0x00000000000000000000000000000000000000ff" as Address;

describe("payment memos", () => {
  it("round-trips ISO 20022 fields", () => {
    const hex = encodePaymentMemo({ EndToEndId: "E2E-1", PmtInfId: "RUN-1", Purp: "COMM", CdtrRef: "INV-7" });
    expect(decodeMemo(hex)).toEqual({
      kind: "payment",
      memo: { EndToEndId: "E2E-1", PmtInfId: "RUN-1", Purp: "COMM", CdtrRef: "INV-7" },
    });
  });

  it("rejects values outside ISO 20022 limits", () => {
    expect(() => encodePaymentMemo({ EndToEndId: "x".repeat(36) })).toThrow();
    expect(() => encodePaymentMemo({ EndToEndId: "ok", Purp: "commission" })).toThrow();
    expect(() => encodePaymentMemo({ EndToEndId: "bad\nline" })).toThrow();
  });

  it("decodes anchors and tolerates foreign memos", () => {
    const anchor = { PmtInfId: "RUN-1", NbOfTxs: 2, CtrlSum: "3", LedgerHash: `0x${"ab".repeat(32)}` as const };
    expect(decodeMemo(encodeRunAnchor(anchor))).toEqual({ kind: "anchor", anchor });
    expect(decodeMemo("0x68656c6c6f").kind).toBe("unknown");
  });

  it("derives a stable memoId per EndToEndId", () => {
    expect(paymentMemoId("E2E-1")).toBe(paymentMemoId("E2E-1"));
    expect(paymentMemoId("E2E-1")).not.toBe(paymentMemoId("E2E-2"));
  });
});

describe("ledger hash", () => {
  const rows: PayoutInstruction[] = [
    { EndToEndId: "E2", recipient: B, amount: "2.50", token: "USDC" },
    { EndToEndId: "E1", recipient: A, amount: "1", token: "USDC" },
  ];
  it("ignores row order and amount formatting", () => {
    const reordered: PayoutInstruction[] = [
      { ...rows[1]!, amount: "1.000000" },
      { ...rows[0]!, amount: "2.5" },
    ];
    expect(ledgerHash(rows)).toBe(ledgerHash(reordered));
  });
  it("changes when an amount changes", () => {
    expect(ledgerHash(rows)).not.toBe(ledgerHash([{ ...rows[0]!, amount: "2.51" }, rows[1]!]));
  });
});

describe("buildPayoutRun", () => {
  const instructions: PayoutInstruction[] = [
    { EndToEndId: "R1-1", recipient: A, amount: "1.25", token: "USDC", Purp: "COMM" },
    { EndToEndId: "R1-2", recipient: B, amount: "0.75", token: "USDC" },
  ];

  it("batches an anchor plus one memo call per payment", () => {
    const plan = buildPayoutRun({ network: ARC_TESTNET, payer: PAYER, PmtInfId: "R1", instructions });
    expect(plan.to).toBe(ARC_TESTNET.contracts.multicall3From);
    expect(plan.anchor).toMatchObject({ NbOfTxs: 2, CtrlSum: "2" });
    const { args } = decodeFunctionData({ abi: multicall3FromAbi, data: plan.data });
    const calls = args[0] as readonly { target: Address; callData: `0x${string}` }[];
    expect(calls).toHaveLength(3);
    for (const call of calls) expect(call.target).toBe(ARC_TESTNET.contracts.memo);
    const second = decodeFunctionData({ abi: memoAbi, data: calls[1]!.callData });
    expect(second.args[2]).toBe(paymentMemoId("R1-1"));
  });

  it("refuses duplicate ids and mixed tokens", () => {
    expect(() =>
      buildPayoutRun({ network: ARC_TESTNET, payer: PAYER, PmtInfId: "R", instructions: [instructions[0]!, instructions[0]!] }),
    ).toThrow(/Duplicate/);
    expect(() =>
      buildPayoutRun({
        network: ARC_TESTNET,
        payer: PAYER,
        PmtInfId: "R",
        instructions: [instructions[0]!, { ...instructions[1]!, token: "EURC" }],
      }),
    ).toThrow(/single token/);
  });
});
