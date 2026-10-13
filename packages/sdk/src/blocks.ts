import type { PublicClient } from "viem";

/**
 * Accountants think in dates, not block numbers. Arc blocks are produced
 * roughly every half second with non-decreasing timestamps, so a binary
 * search over block timestamps finds the first block at or after a given
 * time in about 25 RPC calls regardless of chain height.
 */
export async function blockAtTimestamp(client: PublicClient, timestampSeconds: number, latest?: bigint): Promise<bigint> {
  let hi = latest ?? (await client.getBlockNumber());
  let lo = 0n;
  const tsOf = async (n: bigint) => Number((await client.getBlock({ blockNumber: n })).timestamp);
  if ((await tsOf(hi)) < timestampSeconds) return hi;
  while (lo < hi) {
    const mid = (lo + hi) / 2n;
    if ((await tsOf(mid)) < timestampSeconds) lo = mid + 1n;
    else hi = mid;
  }
  return lo;
}

/** Block range covering two calendar dates (inclusive), interpreted as UTC. */
export async function blockRangeForDates(client: PublicClient, fromDate: string, toDate: string): Promise<{ fromBlock: bigint; toBlock: bigint }> {
  const start = Date.parse(`${fromDate}T00:00:00Z`) / 1000;
  const end = Date.parse(`${toDate}T23:59:59Z`) / 1000;
  if (!Number.isFinite(start) || !Number.isFinite(end)) throw new Error("Dates must be YYYY-MM-DD");
  if (end < start) throw new Error("From date must not be after to date");
  const latest = await client.getBlockNumber();
  const fromBlock = await blockAtTimestamp(client, start, latest);
  const firstAfter = await blockAtTimestamp(client, end + 1, latest);
  const toBlock = firstAfter > fromBlock && firstAfter <= latest && firstAfter > 0n ? firstAfter - 1n : latest;
  return { fromBlock, toBlock: toBlock < fromBlock ? fromBlock : toBlock };
}
