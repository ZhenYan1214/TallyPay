import { getAddress, keccak256, type Address, type Hex, type PublicClient } from "viem";
import { erc20Abi, memoEvent, transferEvent } from "./abis.js";
import { transferCallData } from "./batch.js";
import { decodeMemo, type DecodedMemo, type RunAnchor } from "./memo.js";
import type { TokenSymbol } from "./ledger.js";
import { MAX_LOG_RANGE, NATIVE_TO_UNITS, SYSTEM_TRANSFER_EMITTER, type ArcNetwork } from "./networks.js";

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
  /**
   * True when the USDC moved as native value (a plain "send" from a wallet)
   * rather than through the ERC-20 interface. Such transfers only appear in
   * the EIP-7708 log from the system emitter; `amount` is the 18-decimal
   * value floored to 6 decimals and `amountWei` keeps the exact figure.
   */
  native?: boolean;
  amountWei?: bigint;
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

/** Token balance at the edges of the scanned range, for a roll-forward check. */
export interface BalanceObservation {
  token: TokenSymbol;
  /** Balance at fromBlock - 1, in 6-decimal units. */
  opening: bigint;
  /** Balance at toBlock, in 6-decimal units. */
  closing: bigint;
}

export interface AccountActivity {
  network: ArcNetwork["id"];
  account: Address;
  fromBlock: bigint;
  toBlock: bigint;
  transfers: TransferObservation[];
  anchors: AnchorObservation[];
  fees: FeeObservation[];
  /** Absent when the RPC cannot serve historical balances. */
  balances?: BalanceObservation[];
}

export interface ObserveOptions {
  client: PublicClient;
  network: ArcNetwork;
  account: Address;
  fromBlock: bigint;
  toBlock?: bigint;
  /** Also collect transfers received by the account. Defaults to true. */
  includeIncoming?: boolean;
  /** Read opening and closing balances for a roll-forward. Defaults to true. */
  includeBalances?: boolean;
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

type RawLog = { address: Address; transactionHash: Hex | null; blockNumber: bigint | null; logIndex: number | null; args: unknown };

/**
 * Reads everything Tallypay needs to reconcile one account over a block range:
 * USDC/EURC transfers in both directions, the Memo events that wrap them,
 * run anchors, the network fees the account paid, and the balances at the
 * edges of the range.
 *
 * Arc emits two logs for every ERC-20 USDC transfer: one from the token
 * contract (6 decimals) and one from the EIP-7708 system emitter (18
 * decimals). A native value transfer, which is what a wallet's plain "send"
 * does, emits only the second. Both sources are read; the system-emitter
 * log is dropped when the same transaction carries the matching ERC-20 log
 * and kept, flagged `native`, when it does not.
 *
 * A memo is linked to a transfer when both sit in the same transaction, the
 * memo's target is the token contract, and the memo's callDataHash equals
 * keccak256(transfer(to, amount)). That ties the memo to the exact call it
 * wrapped, even inside a batch.
 */
export async function observeAccount(options: ObserveOptions): Promise<AccountActivity> {
  const { client, network } = options;
  const account = getAddress(options.account);
  const includeIncoming = options.includeIncoming ?? true;
  const toBlock = options.toBlock ?? (await client.getBlockNumber());
  const tokens: Array<[TokenSymbol, Address]> = [
    ["USDC", network.contracts.usdc],
    ["EURC", network.contracts.eurc],
  ];
  const tokenByAddress = new Map(tokens.map(([symbol, address]) => [address.toLowerCase(), symbol]));

  const transferLogs: Array<{ token: TokenSymbol; log: RawLog }> = [];
  const nativeLogs: RawLog[] = [];
  const memoLogs: RawLog[] = [];

  const getTransfers = (address: Address | Address[], from: bigint, to: bigint, direction: "out" | "in") =>
    client.getLogs({ address, event: transferEvent, args: direction === "out" ? { from: account } : { to: account }, fromBlock: from, toBlock: to });
  const getMemos = (from: bigint, to: bigint) =>
    client.getLogs({ address: network.contracts.memo, event: memoEvent, args: { sender: account }, fromBlock: from, toBlock: to });

  const tokenAddresses = tokens.map(([, address]) => address);
  const chunks = ranges(options.fromBlock, toBlock);
  let done = 0n;
  for (const [from, to] of chunks) {
    // Two requests in flight at a time: public RPCs rate-limit bursts (HTTP 429), and viem's retry only hides so much.
    const [outgoing, incoming] = await Promise.all([
      getTransfers(tokenAddresses, from, to, "out"),
      includeIncoming ? getTransfers(tokenAddresses, from, to, "in") : Promise.resolve([]),
    ]);
    const [nativeOut, nativeIn] = await Promise.all([
      getTransfers(SYSTEM_TRANSFER_EMITTER, from, to, "out"),
      includeIncoming ? getTransfers(SYSTEM_TRANSFER_EMITTER, from, to, "in") : Promise.resolve([]),
    ]);
    const memos = await getMemos(from, to);
    for (const log of [...outgoing, ...incoming]) {
      const token = tokenByAddress.get(log.address.toLowerCase());
      if (token) transferLogs.push({ token, log: log as RawLog });
    }
    nativeLogs.push(...(nativeOut as RawLog[]), ...(nativeIn as RawLog[]));
    memoLogs.push(...(memos as RawLog[]));
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
  const memosByTx = new Map<Hex, RawLog[]>();
  for (const log of memoLogs) {
    const list = memosByTx.get(log.transactionHash!) ?? [];
    list.push(log);
    memosByTx.set(log.transactionHash!, list);
  }
  const usedMemos = new Set<string>();

  const transfers: TransferObservation[] = [];
  const seen = new Set<string>();
  // Every ERC-20 transfer also shows up as a system-emitter log; remember them so those are not counted twice.
  const erc20Shadow = new Map<string, number>();
  const shadowKey = (tx: Hex, from: Address, to: Address, wei: bigint) => `${tx}:${from.toLowerCase()}:${to.toLowerCase()}:${wei}`;

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
    if (token === "USDC") {
      const k = shadowKey(observation.txHash, observation.from, observation.to, value * NATIVE_TO_UNITS);
      erc20Shadow.set(k, (erc20Shadow.get(k) ?? 0) + 1);
    }

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

  // Native value transfers: system-emitter logs with no ERC-20 twin in the same transaction.
  for (const log of nativeLogs) {
    const key = `${log.transactionHash}:${log.logIndex}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const { from, to, value } = log.args as { from: Address; to: Address; value: bigint };
    const k = shadowKey(log.transactionHash!, from, to, value);
    const shadowed = erc20Shadow.get(k) ?? 0;
    if (shadowed > 0) {
      erc20Shadow.set(k, shadowed - 1);
      continue;
    }
    if (value === 0n) continue;
    transfers.push({
      txHash: log.transactionHash!,
      blockNumber: log.blockNumber!,
      timestamp: await timestampOf(log.blockNumber!),
      logIndex: log.logIndex!,
      token: "USDC",
      from: getAddress(from),
      to: getAddress(to),
      amount: value / NATIVE_TO_UNITS,
      amountWei: value,
      native: true,
    });
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

  // Fees: one per transaction the account sent that moved tokens or wrote memos.
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

  let balances: BalanceObservation[] | undefined;
  if (options.includeBalances ?? true) {
    try {
      const openingBlock = options.fromBlock > 0n ? options.fromBlock - 1n : 0n;
      balances = await Promise.all(
        tokens.map(async ([token, address]) => {
          const read = (blockNumber: bigint) =>
            client.readContract({ address, abi: erc20Abi, functionName: "balanceOf", args: [account], blockNumber });
          const [opening, closing] = await Promise.all([read(openingBlock), read(toBlock)]);
          return { token, opening, closing };
        }),
      );
    } catch {
      balances = undefined; // Public RPCs without archive state cannot answer; the roll-forward is simply skipped.
    }
  }

  const byOrder = (a: { blockNumber: bigint }, b: { blockNumber: bigint }) =>
    a.blockNumber === b.blockNumber ? 0 : a.blockNumber < b.blockNumber ? -1 : 1;
  transfers.sort((a, b) => byOrder(a, b) || a.logIndex - b.logIndex);
  anchors.sort(byOrder);
  fees.sort(byOrder);

  return { network: network.id, account, fromBlock: options.fromBlock, toBlock, transfers, anchors, fees, balances };
}
