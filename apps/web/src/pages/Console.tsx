import { useEffect, useMemo, useState } from "react";
import { formatUnits, isAddress, type Address } from "viem";
import { NETWORKS, fromUnits, observeAccount, txUrl, addressUrl, type AccountActivity, type NetworkId } from "@tallypay/sdk";
import {
  buildJournal,
  isException,
  journalCsv,
  reconReportCsv,
  reconcile,
  xeroManualJournalCsv,
  type JournalEntry,
  type ReconReport,
  type ReconStatus,
} from "@tallypay/recon";
import { AnchorBadge, ExternalLink, Notice, Stat, StatusBadge, STATUS_HELP } from "../components/ui.tsx";
import { publicClientFor } from "../lib/chain.ts";
import { download, readLedgerFile, shortHash, type LoadedLedger } from "../lib/ledger-io.ts";

const DEMOS: Array<{ id: NetworkId; file: string }> = [
  { id: "arc-mainnet", file: "./demo/promptbazaar-arc-mainnet.json" },
  { id: "arc-testnet", file: "./demo/promptbazaar-arc-testnet.json" },
];

interface Result {
  report: ReconReport;
  activity: AccountActivity;
  journal: JournalEntry[];
  networkId: NetworkId;
}

type Tab = "items" | "journal" | "export";
type Filter = "all" | "exceptions" | ReconStatus;

export default function Console({
  handoff,
  onHandoffUsed,
}: {
  handoff: { ledger: LoadedLedger; autorun: boolean } | null;
  onHandoffUsed: () => void;
}) {
  const [networkId, setNetworkId] = useState<NetworkId>("arc-mainnet");
  const [account, setAccount] = useState("");
  const [ledger, setLedger] = useState<LoadedLedger | null>(null);
  const [fromBlock, setFromBlock] = useState("");
  const [toBlock, setToBlock] = useState("");
  const [availableDemos, setAvailableDemos] = useState<NetworkId[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [tab, setTab] = useState<Tab>("items");
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    Promise.all(DEMOS.map((d) => fetch(d.file, { method: "HEAD" }).then((r) => (r.ok && r.headers.get("content-type")?.includes("json") ? d.id : null)).catch(() => null))).then(
      (ids) => setAvailableDemos(ids.filter((x): x is NetworkId => !!x)),
    );
  }, []);

  function applyLedger(l: LoadedLedger) {
    setLedger(l);
    if (l.network) setNetworkId(l.network);
    if (l.payer) setAccount(l.payer);
    setFromBlock(l.scan?.fromBlock ?? l.execution?.blockNumber ?? "");
    setToBlock(l.scan?.toBlock ?? l.execution?.blockNumber ?? "");
    setResult(null);
    setError(null);
  }

  useEffect(() => {
    if (!handoff) return;
    applyLedger(handoff.ledger);
    if (handoff.autorun) void run(handoff.ledger);
    onHandoffUsed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handoff]);

  async function loadDemo(id: NetworkId) {
    try {
      const demo = DEMOS.find((d) => d.id === id)!;
      const res = await fetch(demo.file);
      applyLedger((await res.json()) as LoadedLedger);
    } catch (e) {
      setError(`Could not load demo: ${(e as Error).message}`);
    }
  }

  async function onFile(file: File) {
    try {
      const parsed = await readLedgerFile(file);
      applyLedger({
        PmtInfId: parsed.PmtInfId ?? file.name.replace(/\.[^.]+$/, ""),
        network: parsed.network ?? networkId,
        payer: (parsed.payer ?? account) as Address,
        createdAt: parsed.createdAt ?? new Date().toISOString(),
        instructions: parsed.instructions,
        execution: parsed.execution,
        scan: parsed.scan,
        description: parsed.description,
      });
    } catch (e) {
      setError(`Could not read ledger: ${(e as Error).message}`);
    }
  }

  async function run(override?: LoadedLedger) {
    const l = override ?? ledger;
    const net = override?.network ?? networkId;
    const acct = override?.payer ?? account;
    setError(null);
    setResult(null);
    if (!l) return setError("Load a ledger first.");
    if (!isAddress(acct)) return setError("Enter the paying wallet address.");
    const client = publicClientFor(net);
    setRunning(true);
    setProgress(0);
    try {
      const latest = await client.getBlockNumber();
      const to = (override?.scan?.toBlock ?? toBlock) ? BigInt(override?.scan?.toBlock ?? toBlock) : latest;
      const from = (override?.scan?.fromBlock ?? fromBlock) ? BigInt(override?.scan?.fromBlock ?? fromBlock) : to > 9_000n ? to - 9_000n : 0n;
      if (from > to) throw new Error("From block must not be after to block");
      if (to - from > 200_000n) throw new Error("Range too large for a browser scan (max 200,000 blocks ≈ 28 hours on mainnet)");
      const activity = await observeAccount({
        client,
        network: NETWORKS[net],
        account: acct as Address,
        fromBlock: from,
        toBlock: to,
        onProgress: (done, total) => setProgress(Number((done * 100n) / (total || 1n))),
      });
      const report = reconcile([{ PmtInfId: l.PmtInfId, instructions: l.instructions }], activity);
      setResult({ report, activity, journal: buildJournal(report, activity.fees), networkId: net });
      setTab("items");
      setFilter("all");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reconcile a wallet against your ledger</h1>
        <p className="mt-1 text-sm text-slate-600">
          Everything runs in your browser against a public Arc RPC. Your ledger never leaves this page.
        </p>
      </div>

      <section className="card grid gap-4 p-5 md:grid-cols-12">
        <div className="md:col-span-12 flex flex-wrap items-center gap-2">
          {availableDemos.map((id) => (
            <button key={id} className="btn-secondary" onClick={() => loadDemo(id)}>
              Load PromptBazaar demo · {NETWORKS[id].name}
            </button>
          ))}
          <label className="btn-secondary cursor-pointer">
            Upload ledger (CSV or JSON)
            <input type="file" accept=".csv,.json" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </label>
          {ledger && (
            <span className="text-sm text-slate-600">
              Loaded <span className="font-medium text-slate-900">{ledger.PmtInfId}</span> · {ledger.instructions.length} payments
              {ledger.description ? ` · ${ledger.description}` : ""}
            </span>
          )}
        </div>
        <div className="md:col-span-3">
          <span className="label">Network</span>
          <select className="input" value={networkId} onChange={(e) => setNetworkId(e.target.value as NetworkId)}>
            {Object.values(NETWORKS).map((n) => (
              <option key={n.id} value={n.id}>{n.name}</option>
            ))}
          </select>
        </div>
        <div className="md:col-span-5">
          <span className="label">Paying wallet</span>
          <input className="input font-mono" placeholder="0x…" value={account} onChange={(e) => setAccount(e.target.value.trim())} />
        </div>
        <div className="md:col-span-2">
          <span className="label">From block</span>
          <input className="input font-mono" placeholder="latest − 9000" value={fromBlock} onChange={(e) => setFromBlock(e.target.value.trim())} />
        </div>
        <div className="md:col-span-2">
          <span className="label">To block</span>
          <input className="input font-mono" placeholder="latest" value={toBlock} onChange={(e) => setToBlock(e.target.value.trim())} />
        </div>
        <div className="md:col-span-12 flex items-center gap-4">
          <button className="btn-primary" disabled={running || !ledger} onClick={() => run()}>
            {running ? `Scanning Arc… ${progress}%` : "Reconcile"}
          </button>
          {running && (
            <div className="h-1.5 w-48 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full bg-slate-900 transition-all" style={{ width: `${progress}%` }} />
            </div>
          )}
        </div>
      </section>

      {error && <Notice tone="error">{error}</Notice>}
      {result && <Results result={result} tab={tab} setTab={setTab} filter={filter} setFilter={setFilter} />}
    </div>
  );
}

function Results({
  result,
  tab,
  setTab,
  filter,
  setFilter,
}: {
  result: Result;
  tab: Tab;
  setTab: (t: Tab) => void;
  filter: Filter;
  setFilter: (f: Filter) => void;
}) {
  const { report, activity, journal } = result;
  const network = NETWORKS[result.networkId];
  const s = report.summary;
  const exceptions = s.mismatch + s.missing + s.duplicate + s.unexpected;
  const items = useMemo(
    () => report.items.filter((i) => (filter === "all" ? true : filter === "exceptions" ? isException(i.status) : i.status === filter)),
    [report, filter],
  );

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Expected" value={`${fromUnits(s.expectedUnits)}`} hint={`${report.items.filter((i) => i.instruction).length} ledger entries · USDC`} />
        <Stat label="Settled" tone="good" value={`${fromUnits(s.settledUnits)}`} hint={`${s.matched} by memo · ${s.matched_by_intent} by intent`} />
        <Stat label="Exceptions" tone={exceptions ? "bad" : "good"} value={exceptions} hint={`${fromUnits(s.exceptionUnits)} USDC needs review`} />
        <Stat label="Network fees" value={formatUnits(report.feesWei, 18).slice(0, 10)} hint={`USDC across ${activity.fees.length} transaction${activity.fees.length === 1 ? "" : "s"}`} />
        <div className="card p-4">
          <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Run anchor</div>
          <div className="mt-2 space-y-1">
            {report.anchors.map((a) => (
              <div key={a.PmtInfId} className="space-y-1">
                <AnchorBadge status={a.status} />
                {a.observed && (
                  <div className="text-xs text-slate-500">
                    <ExternalLink href={txUrl(network, a.observed.txHash)}>{shortHash(a.observed.txHash)}</ExternalLink>
                  </div>
                )}
                {a.notes.map((n) => <div key={n} className="text-xs text-rose-700">{n}</div>)}
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="text-xs text-slate-500">
        Scanned blocks {activity.fromBlock.toString()}–{activity.toBlock.toString()} on {network.name} for{" "}
        <ExternalLink href={addressUrl(network, activity.account)} className="font-mono">{shortHash(activity.account)}</ExternalLink> ·{" "}
        {activity.transfers.length} transfers · {activity.anchors.length} anchors
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {(["items", "journal", "export"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tab === t ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"}`}
          >
            {{ items: "Reconciliation", journal: "Journal entries", export: "Export" }[t]}
          </button>
        ))}
      </div>

      {tab === "items" && (
        <section className="space-y-3">
          <div className="flex flex-wrap gap-2 text-sm">
            {(["all", "exceptions", "matched", "matched_by_intent", "mismatch", "missing", "duplicate", "unexpected"] as Filter[]).map((f) => {
              const count = f === "all" ? report.items.length : f === "exceptions" ? exceptions : s[f];
              if (f !== "all" && f !== "exceptions" && count === 0) return null;
              return (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`rounded-full px-3 py-1 ring-1 ${filter === f ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-100"}`}
                >
                  {f === "all" ? "All" : f === "exceptions" ? "Exceptions" : <StatusLabel status={f} />} · {count}
                </button>
              );
            })}
          </div>
          <div className="card overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Payment</th>
                  <th className="px-4 py-3">Payee</th>
                  <th className="px-4 py-3 text-right">Ledger</th>
                  <th className="px-4 py-3 text-right">On-chain</th>
                  <th className="px-4 py-3">Transaction</th>
                  <th className="px-4 py-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item, idx) => {
                  const t = item.transfer;
                  return (
                    <tr key={idx} className={isException(item.status) ? "bg-rose-50/30" : ""}>
                      <td className="px-4 py-3 align-top" title={STATUS_HELP[item.status]}><StatusBadge status={item.status} /></td>
                      <td className="px-4 py-3 align-top font-mono text-xs">
                        {item.instruction?.EndToEndId ?? (t?.memo?.decoded.kind === "payment" ? t.memo.decoded.memo.EndToEndId : "—")}
                        {t?.memo ? <div className="mt-0.5 font-sans text-[11px] text-emerald-700">memo on-chain</div> : t ? <div className="mt-0.5 font-sans text-[11px] text-slate-400">no memo</div> : null}
                      </td>
                      <td className="px-4 py-3 align-top">
                        {item.instruction?.payeeName ?? <span className="text-slate-400">Unknown</span>}
                        <div className="font-mono text-[11px] text-slate-500">{shortHash(t?.to ?? item.instruction?.recipient ?? "")}</div>
                      </td>
                      <td className="px-4 py-3 text-right align-top tabular-nums">{item.instruction ? item.instruction.amount : "—"}</td>
                      <td className="px-4 py-3 text-right align-top tabular-nums">{t ? fromUnits(t.amount) : "—"}</td>
                      <td className="px-4 py-3 align-top font-mono text-xs">
                        {t ? <ExternalLink href={txUrl(network, t.txHash)}>{shortHash(t.txHash)}</ExternalLink> : "—"}
                      </td>
                      <td className="px-4 py-3 align-top text-xs text-slate-600">{item.notes.join("; ")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "journal" && (
        <section className="space-y-3">
          <Notice tone="warn">
            Templates for an accountant to review. Cleared payouts debit <b>Payouts payable</b>; exceptions go to <b>Suspense</b> until resolved; network fees are booked once per day.
          </Notice>
          <div className="card overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Narration</th>
                  <th className="px-4 py-3">Account</th>
                  <th className="px-4 py-3 text-right">Debit</th>
                  <th className="px-4 py-3 text-right">Credit</th>
                </tr>
              </thead>
              <tbody>
                {journal.map((entry, i) =>
                  entry.lines.map((l, j) => (
                    <tr key={`${i}-${j}`} className={j === entry.lines.length - 1 ? "border-b border-slate-200" : ""}>
                      <td className="px-4 py-2 align-top text-xs whitespace-nowrap text-slate-500">{j === 0 ? entry.date : ""}</td>
                      <td className="px-4 py-2 align-top text-xs">{j === 0 ? entry.narration : ""}</td>
                      <td className={`px-4 py-2 align-top text-xs ${Number(l.credit) > 0 ? "pl-10" : ""}`}>
                        <span className="font-mono text-slate-500">{l.account}</span> {l.accountName}
                      </td>
                      <td className="px-4 py-2 text-right align-top tabular-nums">{Number(l.debit) > 0 ? l.debit : ""}</td>
                      <td className="px-4 py-2 text-right align-top tabular-nums">{Number(l.credit) > 0 ? l.credit : ""}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "export" && (
        <section className="grid gap-4 md:grid-cols-3">
          <ExportCard
            title="Reconciliation report"
            body="One row per payment and exception, with explorer links. For review and audit files."
            onClick={() => download(`tallypay-reconciliation-${report.account.slice(2, 8)}.csv`, reconReportCsv(report, network.explorerUrl))}
          />
          <ExportCard
            title="Journal (generic CSV)"
            body="Double-entry lines with account codes, 6-decimal amounts and transaction hashes."
            onClick={() => download(`tallypay-journal-${report.account.slice(2, 8)}.csv`, journalCsv(journal))}
          />
          <ExportCard
            title="Xero manual journal import"
            body="Xero 'Import manual journals' layout. USDC lines only, rounded to cents. In Xero, set the USDC wallet up as a current asset, not a bank account."
            onClick={() => download(`tallypay-xero-${report.account.slice(2, 8)}.csv`, xeroManualJournalCsv(journal))}
          />
        </section>
      )}
    </div>
  );
}

function StatusLabel({ status }: { status: ReconStatus }) {
  return <>{{ matched: "Matched", matched_by_intent: "By intent", mismatch: "Mismatch", missing: "Not paid", duplicate: "Duplicate", unexpected: "Unexpected" }[status]}</>;
}

function ExportCard({ title, body, onClick }: { title: string; body: string; onClick: () => void }) {
  return (
    <div className="card flex flex-col justify-between gap-4 p-5">
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="mt-1 text-sm text-slate-600">{body}</p>
      </div>
      <button className="btn-secondary self-start" onClick={onClick}>Download CSV</button>
    </div>
  );
}
