import { decodeEventLog, getAddress, isHex, keccak256, type Address, type Hex, type Log, type PublicClient } from "viem";
import { memoEvent, transferEvent } from "./abis.js";
import { transferCallData } from "./batch.js";
import { decodeMemo, paymentMemoId, type DecodedMemo } from "./memo.js";
import type { TokenSymbol } from "./ledger.js";
import { MAX_LOG_RANGE, type ArcNetwork } from "./networks.js";

/**
 * Memo lookup by indexed memoId.
 *
 * Arc's Memo event indexes `memoId`, so anyone who knows a payment's
 * EndToEndId can find it on-chain without knowing the transaction hash.
 * This is the same pattern as Solana Pay reference keys and Stellar memos:
 * the identifier exists before the payment does, and the chain is queried
 * by that identifier afterwards.
 */
export interface WrappedTransfer {
  token: TokenSymbol;
  from: Address;
  to: Address;
  /** Base units, 6 decimals. */
  amount: bigint;
  logIndex: number;
}

export interface MemoLookupResult {
  memoId: Hex;
  txHash: Hex;
  blockNumber: bigint;
  timestamp: number;
  logIndex: number;
  sender: Address;
  target: Address;
  callDataHash: Hex;
  memoIndex: bigint;
  decoded: DecodedMemo;
  /** The USDC/EURC transfer the memo wrapped, when callDataHash matches one in the same transaction. */
  transfer?: WrappedTransfer;
}

/** Accepts either a raw 32-byte memoId or an EndToEndId, which is hashed the Tallypay way. */
export function memoIdFor(input: string): Hex {
  const trimmed = input.trim();
  if (isHex(trimmed) && trimmed.length === 66) return trimmed.toLowerCase() as Hex;
  return paymentMemoId(trimmed);
}

export interface MemoTarget {
  target: Address;
  callDataHash: Hex;
  logIndex: number;
}

/**
 * Finds the token transfer a Memo event wrapped, given every log of the
 * same transaction. The Memo event is emitted after the inner call, so the
 * matching Transfer must precede it, come from the memo's target contract,
 * and hash to the memo's callDataHash. Nearest preceding match wins, which
 * is correct for nested memos as well.
 */
export function matchWrappedTransfer(
  logs: Array<Pick<Log, "address" | "topics" | "data" | "logIndex">>,
  memo: MemoTarget,
  tokens: Record<string, TokenSymbol>,
): WrappedTransfer | undefined {
  let best: WrappedTransfer | undefined;
  for (const log of logs) {
    const logIndex = log.logIndex ?? -1;
    if (logIndex < 0 || logIndex >= memo.logIndex) continue;
    if (log.address.toLowerCase() !== memo.target.toLowerCase()) continue;
    const token = tokens[log.address.toLowerCase()];
    if (!token) continue;
    let args: { from: Address; to: Address; value: bigint };
    try {
      const decoded = decodeEventLog({ abi: [transferEvent], data: log.data, topics: log.topics as [Hex, ...Hex[]] });
      args = decoded.args as typeof args;
    } catch {
      continue;
    }
    if (keccak256(transferCallData(args.to, args.value)) !== memo.callDataHash) continue;
    if (!best || logIndex > best.logIndex) {
      best = { token, from: getAddress(args.from), to: getAddress(args.to), amount: args.value, logIndex };
    }
  }
  return best;
}

export interface FindMemosOptions {
  client: PublicClient;
  network: ArcNetwork;
  /** 32-byte memoId. Use memoIdFor() to derive it from an EndToEndId. */
  memoId: Hex;
  fromBlock: bigint;
  toBlock?: bigint;
  onProgress?: (done: bigint, total: bigint) => void;
}

/** Every Memo event with this memoId in the block range, with its wrapped transfer resolved. */
export async function findMemos(options: FindMemosOptions): Promise<MemoLookupResult[]> {
  const { client, network, memoId } = options;
  const toBlock = options.toBlock ?? (await client.getBlockNumber());
  const tokens: Record<string, TokenSymbol> = {
    [network.contracts.usdc.toLowerCase()]: "USDC",
    [network.contracts.eurc.toLowerCase()]: "EURC",
  };

  const logs: Awaited<ReturnType<typeof client.getLogs<typeof memoEvent>>> = [];
  const total = toBlock - options.fromBlock + 1n;
  let done = 0n;
  for (let start = options.fromBlock; start <= toBlock; start += MAX_LOG_RANGE + 1n) {
    const end = start + MAX_LOG_RANGE > toBlock ? toBlock : start + MAX_LOG_RANGE;
    logs.push(
      ...(await client.getLogs({
        address: network.contracts.memo,
        event: memoEvent,
        args: { memoId },
        fromBlock: start,
        toBlock: end,
      })),
    );
    done += end - start + 1n;
    options.onProgress?.(done, total);
  }

  const results: MemoLookupResult[] = [];
  const blockTimes = new Map<bigint, number>();
  for (const log of logs) {
    const args = log.args as { sender: Address; target: Address; callDataHash: Hex; memoId: Hex; memo: Hex; memoIndex: bigint };
    const [receipt, timestamp] = await Promise.all([
      client.getTransactionReceipt({ hash: log.transactionHash! }),
      (async () => {
        const cached = blockTimes.get(log.blockNumber!);
        if (cached !== undefined) return cached;
        const ts = Number((await client.getBlock({ blockNumber: log.blockNumber! })).timestamp);
        blockTimes.set(log.blockNumber!, ts);
        return ts;
      })(),
    ]);
    results.push({
      memoId: args.memoId,
      txHash: log.transactionHash!,
      blockNumber: log.blockNumber!,
      timestamp,
      logIndex: log.logIndex!,
      sender: getAddress(args.sender),
      target: getAddress(args.target),
      callDataHash: args.callDataHash,
      memoIndex: args.memoIndex,
      decoded: decodeMemo(args.memo),
      transfer: matchWrappedTransfer(receipt.logs, { target: args.target, callDataHash: args.callDataHash, logIndex: log.logIndex! }, tokens),
    });
  }
  results.sort((a, b) => (a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1));
  return results;
}
