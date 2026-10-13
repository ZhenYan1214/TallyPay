import type { Address, Hex } from "viem";
import type { AccountActivity, AnchorObservation, FeeObservation, TransferObservation } from "./observe.js";

/**
 * A chain scan frozen to JSON. The web app ships one per demo so the demo
 * still renders when a public RPC is slow or unreachable; the snapshot is
 * clearly labelled as such in the UI and carries the block range it covers,
 * so anyone can re-run the live scan and compare.
 */
export interface ActivitySnapshot {
  version: 1;
  takenAt: string;
  activity: AccountActivity;
}

type Json<T> = { [K in keyof T]: T[K] extends bigint ? string : T[K] extends object ? Json<T[K]> : T[K] };

function transferOut(t: TransferObservation) {
  return {
    ...t,
    blockNumber: t.blockNumber.toString(),
    amount: t.amount.toString(),
    amountWei: t.amountWei?.toString(),
    memo: t.memo ? { ...t.memo, memoIndex: t.memo.memoIndex.toString() } : undefined,
  };
}

function transferIn(t: Json<TransferObservation>): TransferObservation {
  return {
    ...t,
    txHash: t.txHash as Hex,
    from: t.from as Address,
    to: t.to as Address,
    blockNumber: BigInt(t.blockNumber),
    amount: BigInt(t.amount),
    amountWei: t.amountWei !== undefined ? BigInt(t.amountWei) : undefined,
    memo: t.memo ? { ...t.memo, memoId: t.memo.memoId as Hex, memoIndex: BigInt(t.memo.memoIndex) } : undefined,
  };
}

export function serializeActivity(activity: AccountActivity, takenAt = new Date()): string {
  const out = {
    version: 1,
    takenAt: takenAt.toISOString(),
    activity: {
      ...activity,
      fromBlock: activity.fromBlock.toString(),
      toBlock: activity.toBlock.toString(),
      transfers: activity.transfers.map(transferOut),
      anchors: activity.anchors.map((a) => ({ ...a, blockNumber: a.blockNumber.toString() })),
      fees: activity.fees.map((f) => ({ ...f, blockNumber: f.blockNumber.toString(), feeWei: f.feeWei.toString() })),
      balances: activity.balances?.map((b) => ({ ...b, opening: b.opening.toString(), closing: b.closing.toString() })),
    },
  };
  return JSON.stringify(out, null, 2) + "\n";
}

export function parseActivity(json: string): ActivitySnapshot {
  const raw = JSON.parse(json) as { version: number; takenAt: string; activity: Json<AccountActivity> };
  if (raw.version !== 1 || !raw.activity) throw new Error("Not a Tallypay activity snapshot");
  const a = raw.activity;
  const activity: AccountActivity = {
    network: a.network,
    account: a.account as Address,
    fromBlock: BigInt(a.fromBlock),
    toBlock: BigInt(a.toBlock),
    transfers: a.transfers.map(transferIn),
    anchors: a.anchors.map((x) => ({ ...x, txHash: x.txHash as Hex, sender: x.sender as Address, blockNumber: BigInt(x.blockNumber) }) as AnchorObservation),
    fees: a.fees.map((x) => ({ ...x, txHash: x.txHash as Hex, from: x.from as Address, blockNumber: BigInt(x.blockNumber), feeWei: BigInt(x.feeWei) }) as FeeObservation),
    balances: a.balances?.map((b) => ({ token: b.token, opening: BigInt(b.opening), closing: BigInt(b.closing) })),
  };
  return { version: 1, takenAt: raw.takenAt, activity };
}
