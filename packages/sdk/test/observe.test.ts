import { describe, expect, it } from "vitest";
import { encodeAbiParameters, encodeEventTopics, getAddress, keccak256, type Address, type Hex, type PublicClient } from "viem";
import {
  ARC_TESTNET,
  SYSTEM_TRANSFER_EMITTER,
  blockAtTimestamp,
  blockRangeForDates,
  encodePaymentMemo,
  encodeReferenceMemo,
  encodeRunAnchor,
  findMemos,
  memoEvent,
  observeAccount,
  paymentMemoId,
  runAnchorMemoId,
  transferCallData,
  transferEvent,
} from "@tieout/sdk";

/**
 * A fake Arc RPC: enough of viem's PublicClient for the reader, fed with
 * the exact log shapes Arc produces, including the EIP-7708 twin logs.
 */
const ME = getAddress("0x00000000000000000000000000000000000000ee");
const OPS = getAddress("0x0000000000000000000000000000000000000099");
const A = getAddress("0x00000000000000000000000000000000000000a1");
const B = getAddress("0x00000000000000000000000000000000000000b2");
const USDC = ARC_TESTNET.contracts.usdc;
const MEMO = ARC_TESTNET.contracts.memo;
const tx = (n: number) => `0x${n.toString(16).padStart(64, "0")}` as Hex;
const E12 = 10n ** 12n;

interface FakeLog {
  address: Address;
  transactionHash: Hex;
  blockNumber: bigint;
  logIndex: number;
  args: Record<string, unknown>;
  topics: Hex[];
  data: Hex;
}

function transferLog(address: Address, txHash: Hex, block: bigint, logIndex: number, from: Address, to: Address, value: bigint): FakeLog {
  return {
    address,
    transactionHash: txHash,
    blockNumber: block,
    logIndex,
    args: { from, to, value },
    topics: encodeEventTopics({ abi: [transferEvent], eventName: "Transfer", args: { from, to } }) as Hex[],
    data: encodeAbiParameters([{ type: "uint256" }], [value]),
  };
}

function memoLog(txHash: Hex, block: bigint, logIndex: number, sender: Address, target: Address, callData: Hex, memoId: Hex, memo: Hex): FakeLog {
  const callDataHash = keccak256(callData);
  return {
    address: MEMO,
    transactionHash: txHash,
    blockNumber: block,
    logIndex,
    args: { sender, target, callDataHash, memoId, memo, memoIndex: BigInt(logIndex) },
    topics: encodeEventTopics({ abi: [memoEvent], eventName: "Memo", args: { sender, target, memoId } }) as Hex[],
    data: encodeAbiParameters([{ type: "bytes32" }, { type: "bytes" }, { type: "uint256" }], [callDataHash, memo, BigInt(logIndex)]),
  };
}

/** One ERC-20 USDC transfer as Arc emits it: token log + system-emitter twin. */
function erc20Transfer(txHash: Hex, block: bigint, logIndex: number, from: Address, to: Address, units: bigint): FakeLog[] {
  return [transferLog(USDC, txHash, block, logIndex, from, to, units), transferLog(SYSTEM_TRANSFER_EMITTER, txHash, block, logIndex + 1, from, to, units * E12)];
}

function fakeClient(logs: FakeLog[], opts: { latest?: bigint; balances?: Record<string, bigint>; senders?: Record<string, Address> } = {}) {
  const latest = opts.latest ?? 1_000n;
  const client = {
    getBlockNumber: async () => latest,
    getBlock: async ({ blockNumber }: { blockNumber: bigint }) => ({ timestamp: 1_700_000_000n + blockNumber * 2n }),
    getLogs: async (q: { address: Address | Address[]; args?: Record<string, unknown>; fromBlock: bigint; toBlock: bigint }) => {
      const addresses = (Array.isArray(q.address) ? q.address : [q.address]).map((a) => a.toLowerCase());
      return logs.filter((l) => {
        if (!addresses.includes(l.address.toLowerCase())) return false;
        if (l.blockNumber < q.fromBlock || l.blockNumber > q.toBlock) return false;
        for (const [k, v] of Object.entries(q.args ?? {})) {
          if (v === undefined) continue;
          const want = (Array.isArray(v) ? v : [v]).map((x) => String(x).toLowerCase());
          if (!want.includes(String(l.args[k]).toLowerCase())) return false;
        }
        return true;
      });
    },
    getTransactionReceipt: async ({ hash }: { hash: Hex }) => {
      const mine = logs.filter((l) => l.transactionHash === hash);
      return { from: opts.senders?.[hash] ?? ME, blockNumber: mine[0]?.blockNumber ?? 0n, gasUsed: 70_000n, effectiveGasPrice: 21_000_000_000n, logs: mine };
    },
    readContract: async ({ address, args, blockNumber }: { address: Address; args: [Address]; blockNumber: bigint }) => {
      const key = `${address.toLowerCase()}:${args[0].toLowerCase()}:${blockNumber}`;
      if (opts.balances && key in opts.balances) return opts.balances[key]!;
      return 0n;
    },
    // Native USDC balance = ERC-20 balance in 18 decimals, as on Arc.
    getBalance: async ({ address, blockNumber }: { address: Address; blockNumber: bigint }) => {
      const key = `${USDC.toLowerCase()}:${address.toLowerCase()}:${blockNumber}`;
      return (opts.balances && key in opts.balances ? opts.balances[key]! : 0n) * E12;
    },
  };
  return client as unknown as PublicClient;
}

describe("observeAccount", () => {
  const payMemo = encodePaymentMemo({ EndToEndId: "P-1", PmtInfId: "R" });
  const anchorMemo = encodeRunAnchor({ PmtInfId: "R", NbOfTxs: 1, CtrlSum: "10", LedgerHash: tx(99) });
  const refMemo = encodeReferenceMemo({ EndToEndId: "P-2", TxHash: tx(3), PmtInfId: "R" });

  const logs: FakeLog[] = [
    // tx 1: anchored batch from ME: anchor (zero self-transfer) + one memo'd payment to A
    ...erc20Transfer(tx(1), 10n, 0, ME, ME, 0n),
    memoLog(tx(1), 10n, 2, ME, USDC, transferCallData(ME, 0n), runAnchorMemoId("R"), anchorMemo),
    ...erc20Transfer(tx(1), 10n, 3, ME, A, 10_000_000n),
    memoLog(tx(1), 10n, 5, ME, USDC, transferCallData(A, 10_000_000n), paymentMemoId("P-1"), payMemo),
    // tx 2: a native wallet send from ME to B: only the system-emitter log exists
    transferLog(SYSTEM_TRANSFER_EMITTER, tx(2), 11n, 0, ME, B, 2_500_000n * E12),
    // tx 3: plain ERC-20 transfer ME -> B, no memo (the Safe-style case)
    ...erc20Transfer(tx(3), 12n, 0, ME, B, 7_000_000n),
    // tx 4: the ops wallet publishes a reference for tx 3
    ...erc20Transfer(tx(4), 13n, 0, OPS, OPS, 0n),
    memoLog(tx(4), 13n, 2, OPS, USDC, transferCallData(OPS, 0n), paymentMemoId("P-2"), refMemo),
    // tx 5: incoming native receipt from A
    transferLog(SYSTEM_TRANSFER_EMITTER, tx(5), 14n, 0, A, ME, 1_000_000n * E12),
    // tx 6: unrelated transfer between other parties, must be ignored
    ...erc20Transfer(tx(6), 15n, 0, A, B, 1n),
  ];
  const balances = { [`${USDC.toLowerCase()}:${ME.toLowerCase()}:9`]: 50_000_000n, [`${USDC.toLowerCase()}:${ME.toLowerCase()}:20`]: 31_500_000n };

  it("reads ERC-20 and native transfers once each, links memos, anchors, references, fees and balances", async () => {
    const client = fakeClient(logs, { balances, senders: { [tx(4)]: OPS } });
    const a = await observeAccount({ client, network: ARC_TESTNET, account: ME, fromBlock: 10n, toBlock: 20n, memoSenders: [OPS] });

    const byTx = (h: Hex) => a.transfers.filter((t) => t.txHash === h);
    expect(byTx(tx(1))).toHaveLength(1); // zero-value anchor carrier dropped, payment kept once
    expect(byTx(tx(1))[0]).toMatchObject({ to: A, amount: 10_000_000n });
    expect(byTx(tx(1))[0]!.native).toBeUndefined();
    expect(byTx(tx(1))[0]!.memo?.decoded).toMatchObject({ kind: "payment", memo: { EndToEndId: "P-1" } });
    expect(byTx(tx(2))[0]).toMatchObject({ to: B, amount: 2_500_000n, native: true, amountWei: 2_500_000n * E12 });
    expect(byTx(tx(3))).toHaveLength(1);
    expect(byTx(tx(3))[0]!.memo).toBeUndefined();
    expect(byTx(tx(5))[0]).toMatchObject({ from: A, to: ME, amount: 1_000_000n, native: true });
    expect(byTx(tx(6))).toHaveLength(0);
    expect(a.transfers).toHaveLength(4);

    expect(a.anchors).toHaveLength(1);
    expect(a.anchors[0]!.anchor.PmtInfId).toBe("R");
    expect(a.references).toHaveLength(1);
    expect(a.references[0]).toMatchObject({ sender: OPS, reference: { EndToEndId: "P-2", TxHash: tx(3) } });

    // Fees: tx 1, 2, 3 were sent by ME; tx 4 by OPS and tx 5 by A are not ME's fees.
    expect(a.fees.map((f) => f.txHash).sort()).toEqual([tx(1), tx(2), tx(3)]);
    expect(a.balances?.find((b) => b.token === "USDC")).toEqual({ token: "USDC", opening: 50_000_000n, closing: 31_500_000n, openingWei: 50_000_000n * E12, closingWei: 31_500_000n * E12 });
  });

  it("skips balances gracefully when the RPC has no historical state", async () => {
    const client = fakeClient(logs);
    (client as unknown as { readContract: () => Promise<never>; getBalance: () => Promise<never> }).readContract = async () => {
      throw new Error("missing trie node");
    };
    (client as unknown as { getBalance: () => Promise<never> }).getBalance = async () => {
      throw new Error("missing trie node");
    };
    const a = await observeAccount({ client, network: ARC_TESTNET, account: ME, fromBlock: 10n, toBlock: 20n });
    expect(a.balances).toBeUndefined();
    expect(a.transfers.length).toBeGreaterThan(0);
  });

  it("can leave incoming transfers out", async () => {
    const a = await observeAccount({ client: fakeClient(logs), network: ARC_TESTNET, account: ME, fromBlock: 10n, toBlock: 20n, includeIncoming: false });
    expect(a.transfers.some((t) => t.to === ME && t.from !== ME)).toBe(false);
  });
});

describe("findMemos", () => {
  it("finds a payment by memoId and resolves the wrapped transfer from the receipt", async () => {
    const memo = encodePaymentMemo({ EndToEndId: "P-1" });
    const logs = [...erc20Transfer(tx(1), 10n, 0, ME, A, 5_000_000n), memoLog(tx(1), 10n, 2, ME, USDC, transferCallData(A, 5_000_000n), paymentMemoId("P-1"), memo)];
    const found = await findMemos({ client: fakeClient(logs), network: ARC_TESTNET, memoId: paymentMemoId("P-1"), fromBlock: 0n, toBlock: 20n });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ sender: ME, decoded: { kind: "payment" }, transfer: { to: A, amount: 5_000_000n, token: "USDC" } });
    expect(await findMemos({ client: fakeClient(logs), network: ARC_TESTNET, memoId: paymentMemoId("P-9"), fromBlock: 0n, toBlock: 20n })).toEqual([]);
  });
});

describe("blockAtTimestamp", () => {
  // Fake chain: block n has timestamp 1_700_000_000 + 2n, latest 1000.
  it("finds the first block at or after a timestamp by binary search", async () => {
    const client = fakeClient([], { latest: 1_000n });
    expect(await blockAtTimestamp(client, 1_700_000_000 + 2 * 377)).toBe(377n);
    expect(await blockAtTimestamp(client, 1_700_000_000 + 2 * 377 + 1)).toBe(378n);
    expect(await blockAtTimestamp(client, 1_700_000_000 - 5)).toBe(0n);
    expect(await blockAtTimestamp(client, 1_700_000_000 + 10_000)).toBe(1_001n); // beyond the tip
  });

  it("turns a date range into an inclusive block range", async () => {
    const client = fakeClient([], { latest: 1_000n });
    // 1_700_000_000 is 2023-11-14T22:13:20Z; the fake chain spans 2000 seconds, all on that day.
    const r = await blockRangeForDates(client, "2023-11-14", "2023-11-14");
    expect(r).toEqual({ fromBlock: 0n, toBlock: 1_000n });
    await expect(blockRangeForDates(client, "2023-11-15", "2023-11-14")).rejects.toThrow(/From date/);
  });
});


describe("observeAccount: memos written by the counterparty", () => {
  it("links a memo on an incoming payment even though the account did not sign it", async () => {
    const memo = encodePaymentMemo({ EndToEndId: "INV-1", PmtInfId: "INV" });
    const logs = [...erc20Transfer(tx(8), 30n, 0, A, ME, 500_000n), memoLog(tx(8), 30n, 2, A, USDC, transferCallData(ME, 500_000n), paymentMemoId("INV-1"), memo)];
    const client = fakeClient(logs, { senders: { [tx(8)]: A } });
    const a = await observeAccount({ client, network: ARC_TESTNET, account: ME, fromBlock: 25n, toBlock: 40n });
    const incoming = a.transfers.find((t) => t.txHash === tx(8))!;
    expect(incoming.memo?.decoded).toMatchObject({ kind: "payment", memo: { EndToEndId: "INV-1" } });
    expect(a.fees).toHaveLength(0); // the counterparty paid that fee, not the account
  });
});
