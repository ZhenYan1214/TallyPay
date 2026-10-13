import { Fragment, useEffect, useState } from "react";
import { NETWORKS, addressUrl, findMemos, fromUnits, memoIdFor, txUrl, type MemoLookupResult, type NetworkId } from "@tieout/sdk";
import { ExternalLink, Notice } from "../components/ui.tsx";
import { publicClientFor } from "../lib/chain.ts";
import { shortHash, type LoadedLedger } from "../lib/ledger-io.ts";
import { DEMOS } from "./Console.tsx";

const LOOKBACK = 200_000n;

/**
 * Looks a payment up by the identifier the payer already has, without a
 * transaction hash. Arc indexes memoId on the Memo event, so this is a single
 * topic-filtered eth_getLogs, the same way Solana Pay finds a payment by its
 * reference key.
 */
export default function Verify() {
  const [networkId, setNetworkId] = useState<NetworkId>("arc-mainnet");
  const [query, setQuery] = useState("");
  const [fromBlock, setFromBlock] = useState("");
  const [toBlock, setToBlock] = useState("");
  const [demo, setDemo] = useState<Record<NetworkId, LoadedLedger | null>>({ "arc-mainnet": null, "arc-testnet": null });
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<MemoLookupResult[] | null>(null);
  const [scanned, setScanned] = useState<{ from: bigint; to: bigint } | null>(null);
  const network = NETWORKS[networkId];

  useEffect(() => {
    for (const d of DEMOS) {
      fetch(d.file)
        .then((r) => (r.ok && r.headers.get("content-type")?.includes("json") ? r.json() : null))
        .then((ledger: LoadedLedger | null) => setDemo((prev) => ({ ...prev, [d.id]: ledger })))
        .catch(() => undefined);
    }
  }, []);

  function applyDemoPayment(ledger: LoadedLedger) {
    if (ledger.network) setNetworkId(ledger.network);
    setQuery(ledger.instructions[0]?.EndToEndId ?? "");
    setFromBlock(ledger.scan?.fromBlock ?? ledger.execution?.blockNumber ?? "");
    setToBlock(ledger.scan?.toBlock ?? ledger.execution?.blockNumber ?? "");
    setResults(null);
    setError(null);
  }

  async function run() {
    setError(null);
    setResults(null);
    if (!query.trim()) return setError("Enter an EndToEndId from your ledger, or a 32-byte memoId.");
    const client = publicClientFor(networkId);
    setRunning(true);
    setProgress(0);
    try {
      const latest = await client.getBlockNumber();
      const to = toBlock ? BigInt(toBlock) : latest;
      const from = fromBlock ? BigInt(fromBlock) : to > LOOKBACK ? to - LOOKBACK : 0n;
      if (from > to) throw new Error("From block must not be after to block");
      const found = await findMemos({
        client,
        network,
        memoId: memoIdFor(query),
        fromBlock: from,
        toBlock: to,
        onProgress: (done, total) => setProgress(Number((done * 100n) / (total || 1n))),
      });
      setScanned({ from, to });
      setResults(found);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  const memoId = query.trim() ? memoIdFor(query) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Verify a payment by its identifier</h1>
        <p className="mt-1 text-sm text-slate-600">
          No transaction hash needed. Arc indexes <code className="font-mono text-xs">memoId</code> on every Memo event, so an auditor holding only
          the ledger's <code className="font-mono text-xs">EndToEndId</code> can ask the chain directly whether, when and how it was paid.
        </p>
      </div>

      <section className="card grid gap-4 p-5 md:grid-cols-12">
        <div className="md:col-span-3">
          <span className="label">Network</span>
          <select className="input" value={networkId} onChange={(e) => { setNetworkId(e.target.value as NetworkId); setResults(null); }}>
            {Object.values(NETWORKS).map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
          </select>
        </div>
        <div className="md:col-span-5">
          <span className="label">EndToEndId or memoId</span>
          <input className="input font-mono" placeholder="PB-202610-XXXX-S01 or 0x…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <span className="label">From block</span>
          <input className="input font-mono" placeholder={`latest − ${LOOKBACK.toLocaleString("en-US")}`} value={fromBlock} onChange={(e) => setFromBlock(e.target.value.trim())} />
        </div>
        <div className="md:col-span-2">
          <span className="label">To block</span>
          <input className="input font-mono" placeholder="latest" value={toBlock} onChange={(e) => setToBlock(e.target.value.trim())} />
        </div>
        <div className="md:col-span-12 flex flex-wrap items-center gap-3">
          <button className="btn-primary" disabled={running} onClick={run}>{running ? `Querying Arc… ${progress}%` : "Look up"}</button>
          {DEMOS.map((d) => {
            const l = demo[d.id];
            return l ? (
              <button key={d.id} className="btn-secondary" onClick={() => applyDemoPayment(l)}>Use a demo payment · {NETWORKS[d.id].name}</button>
            ) : null;
          })}
          {memoId && (
            <span className="text-xs text-slate-500">
              memoId = keccak256("tp1:" + EndToEndId) = <span className="font-mono">{shortHash(memoId, 10, 6)}</span>
            </span>
          )}
        </div>
      </section>

      {error && <Notice tone="error">{error}</Notice>}

      {results && scanned && (
        <section className="space-y-3">
          <div className="text-xs text-slate-500">
            Scanned blocks {scanned.from.toString()}–{scanned.to.toString()} on {network.name} for memoId{" "}
            <span className="font-mono">{memoId}</span> · {results.length} memo event{results.length === 1 ? "" : "s"}
          </div>
          {results.length === 0 && (
            <Notice tone="warn">
              No Memo event with this memoId in the scanned range. Widen the block range, check the network, or the payment may have been sent without a memo
              (a Safe or MPC wallet cannot call Memo). The Reconcile page can still match it by recipient and amount.
            </Notice>
          )}
          {results.map((r) => (
            <div key={`${r.txHash}:${r.logIndex}`} className="card space-y-3 p-5">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${r.transfer ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-amber-50 text-amber-800 ring-amber-200"}`}>
                  {r.transfer ? "Memo and transfer linked by callDataHash" : "Memo found, no token transfer under it"}
                </span>
                <span className="text-slate-600">{new Date(r.timestamp * 1000).toISOString().replace("T", " ").slice(0, 19)} UTC · block {r.blockNumber.toString()}</span>
                <ExternalLink href={txUrl(network, r.txHash)} className="font-mono text-xs">{shortHash(r.txHash)}</ExternalLink>
              </div>
              <div className="grid gap-4 text-sm md:grid-cols-2">
                <div>
                  <span className="label">Memo (decoded)</span>
                  {r.decoded.kind === "payment" && (
                    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono text-xs">
                      {Object.entries(r.decoded.memo).map(([k, v]) => (<Fragment key={k}><dt className="text-slate-500">{k}</dt><dd>{String(v)}</dd></Fragment>))}
                    </dl>
                  )}
                  {r.decoded.kind === "anchor" && (
                    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono text-xs">
                      {Object.entries(r.decoded.anchor).map(([k, v]) => (<Fragment key={k}><dt className="text-slate-500">{k}</dt><dd className="break-all">{String(v)}</dd></Fragment>))}
                    </dl>
                  )}
                  {r.decoded.kind === "unknown" && <div className="font-mono text-xs break-all">{r.decoded.text}</div>}
                </div>
                <div className="space-y-2">
                  <div>
                    <span className="label">Wrapped transfer</span>
                    {r.transfer ? (
                      <div className="text-sm">
                        {fromUnits(r.transfer.amount)} {r.transfer.token} to{" "}
                        <ExternalLink href={addressUrl(network, r.transfer.to)} className="font-mono text-xs">{shortHash(r.transfer.to)}</ExternalLink>
                      </div>
                    ) : (
                      <div className="text-sm text-slate-500">None with a positive amount in this transaction.</div>
                    )}
                  </div>
                  <div>
                    <span className="label">Sender (payer EOA)</span>
                    <ExternalLink href={addressUrl(network, r.sender)} className="font-mono text-xs">{r.sender}</ExternalLink>
                  </div>
                  <div>
                    <span className="label">callDataHash</span>
                    <div className="font-mono text-xs break-all">{r.callDataHash}</div>
                    {r.transfer && <div className="text-xs text-emerald-700">= keccak256(transfer({shortHash(r.transfer.to)}, {r.transfer.amount.toString()}))</div>}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="grid gap-4 md:grid-cols-3">
        <div className="card p-5 text-sm text-slate-600">
          <h3 className="font-semibold text-slate-900">Why this matters</h3>
          <p className="mt-1">An accountant or auditor gets a list of identifiers, not transaction hashes. On Arc the identifier itself is the index.</p>
        </div>
        <div className="card p-5 text-sm text-slate-600">
          <h3 className="font-semibold text-slate-900">How it is derived</h3>
          <p className="mt-1 font-mono text-xs">memoId = keccak256("tp1:" + EndToEndId)</p>
          <p className="mt-1">One topic-filtered <code className="font-mono text-xs">eth_getLogs</code> on the Memo contract. Any indexer can do the same.</p>
        </div>
        <div className="card p-5 text-sm text-slate-600">
          <h3 className="font-semibold text-slate-900">What is checked</h3>
          <p className="mt-1">The memo's <code className="font-mono text-xs">callDataHash</code> is recomputed from the USDC transfer in the same transaction, so the memo provably belongs to that exact payment.</p>
        </div>
      </section>
    </div>
  );
}
