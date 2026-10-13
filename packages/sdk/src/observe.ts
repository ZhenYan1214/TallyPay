import { getAddress, keccak256, type Address, type Hex, type PublicClient } from "viem";
import { memoEvent, transferEvent } from "./abis.js";
import { transferCallData } from "./batch.js";
import { decodeMemo, type DecodedMemo, type RunAnchor } from "./memo.js";
import type { TokenSymbol } from "./ledger.js";
import { MAX_LOG_RANGE, type ArcNetwork } from "./networks.js";

/** A token movement seen on-chain, with its memo when one wraps it. */
export interface TransferObservation {
  txHash: Hex;
  blockNumber: bigint;
  timestamp: number;
  logIndex: number;
  token: TokenSymbol;
  from: Address;
  to: Address;
  /** Base units, 6 decimals. */
  amount: bigint;
  memo?: {
    memoId: Hex;
    memoIndex: bigint;
    decoded: DecodedMemo;
  };
}

export interface AnchorObservation {
  txHash: Hex;
  blockNumber: bigint;
  timestamp: number;
  sender: Address;
  anchor: RunAnchor;
}

/** Network fee paid by the observed account, in USDC (18-decimal native units). */
export interface FeeObservation {
  txHash: Hex;
  blockNumber: bigint;
  timestamp: number;
  from: Address;
  feeWei: bigint;
}

export interface AccountActivity {
  network: ArcNetwork["id"];
  account: Address;
  fromBlock: bigint;
  toBlock: bigint;
  transfers: TransferObservation[];
  anchors: AnchorObservation[];
  fees: FeeObservation[];
}

export interface ObserveOptions {
  client: PublicClient;
  network: ArcNetwork;
  account: Address;
  fromBlock: bigint;
  toBlock?: bigint;
  /** Also collect transfers received by the account. Defaults to false. */
  includeIncoming?: boolean;
  onProgress?: (done: bigint, total: bigint) => void;
}

function ranges(from: bigint, to: bigint): Array<[bigint, bigint]> {
  const out: Array<[bigint, bigint]> = [];
  for (let start = from; start <= to; start += MAX_LOG_RANGE + 1n) {
    const end = start + MAX_LOG_RANGE > to ? to : start + MAX_LOG_RANGE;
    out.push([start, end]);
  }
  return out;
}

/**
 * Reads everything Tallypay needs to reconcile one account over a block range:
 * outgoing USDC/EURC transfers, the Memo events that wrap them, run anchors,
 * and the network fees the account paid.
 *
 * A memo is linked to a transfer when both sit in the same transaction, the
 * memo's target is the token contract, and the memo's callDataHash equals
 * keccak256(transfer(to, amount)). That ties the memo to the exact call it
 * wrapped, even inside a batch.
 */
export async function observeAccount(options: ObserveOptions): Promise<AccountActivity> {
  const { client, network } = options;
  const account = getAddress(options.account);
  const toBlock = options.toBlock ?? (await client.getBlockNumber());
  const tokens: Array<[TokenSymbol, Address]> = [
    ["USDC", network.contracts.usdc],
    ["EURC", network.contracts.eurc],
  ];
  const tokenByAddress = new Map(tokens.map(([symbol, address]) => [address.toLowerCase(), symbol]));

  const transferLogs: Array<{ token: TokenSymbol; log: Awaited<ReturnType<typeof getTransfers>>[number] }> = [];
  const memoLogs: Awaited<ReturnType<typeof getMemos>> = [];

  async function getTransfers(from: bigint, to: bigint, direction: "out" | "in") {
    return client.getLogs({
      address: tokens.map(([, address]) => address),
      event: transferEvent,
      args: direction === "out" ? { from: account } : { to: account },
      fromBlock: from,
      toBlock: to,
    });
  }
  async function getMemos(from: bigint, to: bigint) {
    return client.getLogs({
      address: network.contracts.memo,
      event: memoEvent,
      args: { sender: account },
      fromBlock: from,
      toBlock: to,
    });
  }

  const chunks = ranges(options.fromBlock, toBlock);
  let done = 0n;
  for (const [from, to] of chunks) {
    const [outgoing, incoming, memos] = await Promise.all([
      getTransfers(from, to, "out"),
      options.includeIncoming ? getTransfers(from, to, "in") : Promise.resolve([]),
      getMemos(from, to),
    ]);
    for (const log of [...outgoing, ...incoming]) {
      const token = tokenByAddress.get(log.address.toLowerCase());
      if (token) transferLogs.push({ token, log });
    }
    memoLogs.push(...memos);
    done += to - from + 1n;
    options.onProgress?.(done, toBlock - options.fromBlock + 1n);
  }

  const blockTimes = new Map<bigint, number>();
  async function timestampOf(blockNumber: bigint): Promise<number> {
    const cached = blockTimes.get(blockNumber);
    if (cached !== undefined) return cached;
    const block = await client.getBlock({ blockNumber });
    const ts = Number(block.timestamp);
    blockTimes.set(blockNumber, ts);
    return ts;
  }

  // Index memos by tx so each transfer can find the one that wrapped it.
  const memosByTx = new Map<Hex, typeof memoLogs>();
  for (const log of memoLogs) {
    const list = memosByTx.get(log.transactionHash!) ?? [];
    list.push(log);
    memosByTx.set(log.transactionHash!, list);
  }
  const usedMemos = new Set<string>();

  const transfers: TransferObservation[] = [];
  const seen = new Set<string>();
  for (const { token, log } of transferLogs) {
    const key = `${log.transactionHash}:${log.logIndex}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const { from, to, value } = log.args as { from: Address; to: Address; value: bigint };
    const observation: TransferObservation = {
      txHash: log.transactionHash!,
      blockNumber: log.blockNumber!,
      timestamp: await timestampOf(log.blockNumber!),
      logIndex: log.logIndex!,
      token,
      from: getAddress(from),
      to: getAddress(to),
      amount: value,
    };

    const expectedHash = keccak256(transferCallData(observation.to, value));
    const candidates = (memosByTx.get(log.transactionHash!) ?? [])
      .filter((m) => {
        const args = m.args as { target: Address; callDataHash: Hex };
        return (
          !usedMemos.has(`${m.transactionHash}:${m.logIndex}`) &&
          args.target.toLowerCase() === log.address.toLowerCase() &&
          args.callDataHash === expectedHash &&
          m.logIndex! > log.logIndex!
        );
      })
      .sort((a, b) => a.logIndex! - b.logIndex!);
    const match = candidates[0];
    if (match) {
      usedMemos.add(`${match.transactionHash}:${match.logIndex}`);
      const args = match.args as { memoId: Hex; memo: Hex; memoIndex: bigint };
      observation.memo = { memoId: args.memoId, memoIndex: args.memoIndex, decoded: decodeMemo(args.memo) };
    }
    // Zero-value self transfers only exist to carry run anchors.
    if (!(value === 0n && observation.from === observation.to)) transfers.push(observation);
  }

  const anchors: AnchorObservation[] = [];
  for (const log of memoLogs) {
    const args = log.args as { sender: Address; memo: Hex };
    const decoded = decodeMemo(args.memo);
    if (decoded.kind !== "anchor") continue;
    anchors.push({
      txHash: log.transactionHash!,
      blockNumber: log.blockNumber!,
      timestamp: await timestampOf(log.blockNumber!),
      sender: getAddress(args.sender),
      anchor: decoded.anchor,
    });
  }

  // Fees: one per transaction the account sent that touched these contracts.
  const sentTxs = new Set<Hex>();
  for (const t of transfers) if (t.from === account) sentTxs.add(t.txHash);
  for (const a of anchors) sentTxs.add(a.txHash);
  const fees: FeeObservation[] = [];
  for (const txHash of sentTxs) {
    const receipt = await client.getTransactionReceipt({ hash: txHash });
    if (getAddress(receipt.from) !== account) continue;
    fees.push({
      txHash,
      blockNumber: receipt.blockNumber,
      timestamp: await timestampOf(receipt.blockNumber),
      from: account,
      feeWei: receipt.gasUsed * receipt.effectiveGasPrice,
    });
  }

  const byOrder = (a: { blockNumber: bigint }, b: { blockNumber: bigint }) =>
    a.blockNumber === b.blockNumber ? 0 : a.blockNumber < b.blockNumber ? -1 : 1;
  transfers.sort((a, b) => byOrder(a, b) || a.logIndex - b.logIndex);
  anchors.sort(byOrder);
  fees.sort(byOrder);

  return { network: network.id, account, fromBlock: options.fromBlock, toBlock, transfers, anchors, fees };
}
