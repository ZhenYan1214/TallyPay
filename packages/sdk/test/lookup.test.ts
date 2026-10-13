import { describe, expect, it } from "vitest";
import { encodeAbiParameters, encodeEventTopics, getAddress, keccak256, pad, type Address, type Hex } from "viem";
import {
  ARC_TESTNET,
  matchWrappedTransfer,
  memoIdFor,
  parseActivity,
  paymentMemoId,
  serializeActivity,
  transferCallData,
  transferEvent,
  type AccountActivity,
} from "@tieout/sdk";

const PAYER = "0x00000000000000000000000000000000000000ff" as Address;
const A = "0x00000000000000000000000000000000000000a1" as Address;
const USDC = ARC_TESTNET.contracts.usdc;
const EMITTER = "0xfffffffffffffffffffffffffffffffffffffffe" as Address;

function transferLog(address: Address, from: Address, to: Address, value: bigint, logIndex: number) {
  return {
    address,
    topics: encodeEventTopics({ abi: [transferEvent], eventName: "Transfer", args: { from, to } }) as [Hex, ...Hex[]],
    data: encodeAbiParameters([{ type: "uint256" }], [value]),
    logIndex,
  };
}

describe("memoIdFor", () => {
  it("hashes EndToEndIds and passes raw memoIds through", () => {
    expect(memoIdFor("PB-1-S01")).toBe(paymentMemoId("PB-1-S01"));
    const raw = pad("0xabcd", { size: 32 });
    expect(memoIdFor(raw.toUpperCase().replace("0X", "0x"))).toBe(raw);
  });
});

describe("matchWrappedTransfer", () => {
  const tokens = { [USDC.toLowerCase()]: "USDC" as const };

  it("links the memo to the transfer whose calldata it hashed, ignoring the 18-decimal system emitter", () => {
    const amount = 1_250_000n;
    const logs = [
      transferLog(USDC, PAYER, A, amount, 3),
      transferLog(EMITTER, PAYER, A, amount * 10n ** 12n, 4), // EIP-7708 duplicate
    ];
    const memo = { target: USDC, callDataHash: keccak256(transferCallData(A, amount)), logIndex: 5 };
    expect(matchWrappedTransfer(logs, memo, tokens)).toMatchObject({ token: "USDC", to: getAddress(A), amount, logIndex: 3 });
  });

  it("ignores transfers emitted after the memo or with a different hash", () => {
    const memo = { target: USDC, callDataHash: keccak256(transferCallData(A, 1n)), logIndex: 2 };
    expect(matchWrappedTransfer([transferLog(USDC, PAYER, A, 1n, 6)], memo, tokens)).toBeUndefined();
    expect(matchWrappedTransfer([transferLog(USDC, PAYER, A, 2n, 1)], memo, tokens)).toBeUndefined();
  });

  it("picks the nearest preceding match inside a batch", () => {
    const memo = { target: USDC, callDataHash: keccak256(transferCallData(A, 7n)), logIndex: 10 };
    const logs = [transferLog(USDC, PAYER, A, 7n, 2), transferLog(USDC, PAYER, A, 7n, 8)];
    expect(matchWrappedTransfer(logs, memo, tokens)?.logIndex).toBe(8);
  });
});

describe("activity snapshot", () => {
  it("round-trips bigints", () => {
    const activity: AccountActivity = {
      network: "arc-testnet",
      account: PAYER,
      fromBlock: 10n,
      toBlock: 20n,
      transfers: [
        {
          txHash: `0x${"1".repeat(64)}`,
          blockNumber: 12n,
          timestamp: 1_760_000_000,
          logIndex: 3,
          token: "USDC",
          from: PAYER,
          to: A,
          amount: 123_456n,
          memo: { memoId: paymentMemoId("X"), memoIndex: 99n, decoded: { kind: "payment", memo: { EndToEndId: "X" } } },
        },
      ],
      anchors: [
        {
          txHash: `0x${"2".repeat(64)}`,
          blockNumber: 12n,
          timestamp: 1_760_000_000,
          sender: PAYER,
          anchor: { PmtInfId: "R", NbOfTxs: 1, CtrlSum: "0.123456", LedgerHash: `0x${"3".repeat(64)}` },
        },
      ],
      fees: [{ txHash: `0x${"2".repeat(64)}`, blockNumber: 12n, timestamp: 1_760_000_000, from: PAYER, feeWei: 5_000_000_000_000n }],
    };
    const json = serializeActivity(activity, new Date("2026-10-13T00:00:00Z"));
    const parsed = parseActivity(json);
    expect(parsed.takenAt).toBe("2026-10-13T00:00:00.000Z");
    expect(parsed.activity).toEqual(activity);
    expect(() => parseActivity('{"version":2}')).toThrow();
  });
});
