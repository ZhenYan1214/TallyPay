import { describe, expect, it } from "vitest";
import { decodeFunctionData, type Address, type Hex } from "viem";
import { ARC_TESTNET, buildReferenceBatch, decodeMemo, encodeReferenceMemo, memoAbi, multicall3FromAbi, paymentMemoId } from "@tieout/sdk";

const OPS = "0x0000000000000000000000000000000000000099" as Address;
const TX = `0x${"ab".repeat(32)}` as Hex;

describe("reference memos", () => {
  it("round-trips and normalises the hash", () => {
    const hex = encodeReferenceMemo({ EndToEndId: "R-1", TxHash: TX.toUpperCase().replace("0X", "0x") as Hex, PmtInfId: "R" });
    expect(decodeMemo(hex)).toEqual({ kind: "reference", reference: { EndToEndId: "R-1", TxHash: TX, PmtInfId: "R" } });
  });

  it("rejects bad hashes", () => {
    expect(() => encodeReferenceMemo({ EndToEndId: "R-1", TxHash: "0x1234" as Hex })).toThrow(/TxHash/);
  });

  it("batches one memo per reference, each sharing the payment memoId", () => {
    const plan = buildReferenceBatch({ network: ARC_TESTNET, signer: OPS, references: [{ EndToEndId: "R-1", TxHash: TX }, { EndToEndId: "R-2", TxHash: TX }] });
    expect(plan.to).toBe(ARC_TESTNET.contracts.multicall3From);
    const { args } = decodeFunctionData({ abi: multicall3FromAbi, data: plan.data });
    const calls = args[0] as readonly { target: Address; callData: Hex }[];
    expect(calls).toHaveLength(2);
    const first = decodeFunctionData({ abi: memoAbi, data: calls[0]!.callData });
    expect(first.args[2]).toBe(paymentMemoId("R-1"));
    expect(decodeMemo(first.args[3] as Hex)).toMatchObject({ kind: "reference" });
    expect(() => buildReferenceBatch({ network: ARC_TESTNET, signer: OPS, references: [{ EndToEndId: "R-1", TxHash: TX }, { EndToEndId: "R-1", TxHash: TX }] })).toThrow(/Duplicate/);
  });
});
