import { useEffect, useMemo, useRef, useState } from "react";
import { createWalletClient, custom, formatUnits, isAddress, type Address, type Hex } from "viem";
import {
  MIN_MAX_FEE_PER_GAS,
  NETWORKS,
  addressUrl,
  blockRangeForDates,
  buildReferenceBatch,
  fromUnits,
  observeAccount,
  parseActivity,
  serializeActivity,
  toViemChain,
  txUrl,
  type AccountActivity,
  type NetworkId,
} from "@tieout/sdk";
import {
  buildJournal,
  camt054Xml,
  isException,
  journalCsv,
  qboJournalCsv,
  reconReportCsv,
  reconcile,
  xeroManualJournalCsv,
  type Decision,
  type JournalEntry,
  type ReconItem,
  type ReconReport,
  type ReconStatus,
} from "@tieout/recon";
import { AnchorBadge, Collapsible, EmptyState, ExternalLink, Field, Mono, Notice, PageHeader, ProgressBar, Stat, StatusBadge, STATUS_HELP, fmt } from "../components/ui.tsx";
import { hashFlags } from "../App.tsx";
import { ensureNetwork, injectedProvider, publicClientFor, rpcOverride, setRpcOverride } from "../lib/chain.ts";
import { download, readLedgerFile, type LoadedLedger } from "../lib/ledger-io.ts";

/** Demo ledgers shipped with the app. Mainnet first: that is the one reviewers should see. */
export const DEMOS: Array<{ id: NetworkId; file: string; snapshot: string }> = [
  { id: "arc-mainnet", file: "./demo/promptbazaar-arc-mainnet.json", snapshot: "./demo/promptbazaar-arc-mainnet.activity.json" },
  { id: "arc-testnet", file: "./demo/promptbazaar-arc-testnet.json", snapshot: "./demo/promptbazaar-arc-testnet.activity.json" },
];

/** Arc produces about two blocks a second. */
const BLOCKS_PER_HOUR = 7_200n;
const MAX_RANGE = 200_000n;
const PRESETS: Array<{ label: string; hours: bigint }> = [
  { label: "Last hour", hours: 1n },
  { label: "Last 6 hours", hours: 6n },
  { label: "Last 24 hours", hours: 24n },
];

type Source = { kind: "live" } | { kind: "snapshot"; takenAt: string; reason: string };

interface Result {
  report: ReconReport;
  activity: AccountActivity;
  journal: JournalEntry[];
  networkId: NetworkId;
  source: Source;
  ledgers: LoadedLedger[];
  signers: Address[];
  decisions: Decision[];
}

type Tab = "items" | "journal" | "export";
type Filter = "all" | "exceptions" | ReconStatus;

async function headOk(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { method: "HEAD" });
    return r.ok && !!r.headers.get("content-type")?.includes("json");
  } catch {
    return false;
  }
}

function parseAddresses(text: string): Address[] {
  return text
    .split(/[\s,;]+/)
    .map((a) => a.trim())
    .filter((a): a is Address => isAddress(a));
}

function friendly(e: unknown): string {
  const err = e as { shortMessage?: string; message?: string };
  const text = (err.shortMessage ?? err.message ?? String(e)).split(/\r?\n/)[0]!;
  if (/429|rate limit/i.test(text)) return "The public RPC is rate-limiting. Try again in a moment, or paste your own RPC URL under Advanced.";
  if (/Failed to fetch|NetworkError|HTTP request failed/i.test(text)) return "Could not reach the RPC. Check your connection, or paste your own RPC URL under Advanced.";
  return text;
}

/** Pure recomputation from a scan already in memory: no RPC, so decisions apply instantly. */
function compute(activity: AccountActivity, ledgers: LoadedLedger[], signers: Address[], decisions: Decision[]): { report: ReconReport; journal: JournalEntry[] } {
  const report = reconcile(
    ledgers.map((l) => ({ PmtInfId: l.PmtInfId, instructions: l.instructions })),
    activity,
    { trustedReferenceSigners: [activity.account, ...signers], decisions, incoming: ledgers.length ? "auto" : "reconcile" },
  );
  return { report, journal: buildJournal(report, activity.fees) };
}

export default function Console({
  handoff,
  onHandoffUsed,
}: {
  handoff: { ledger: LoadedLedger; autorun: boolean } | null;
  onHandoffUsed: () => void;
}) {
  const [networkId, setNetworkId] = useState<NetworkId>("arc-mainnet");
  const [account, setAccount] = useState("");
  const [ledgers, setLedgers] = useState<LoadedLedger[]>([]);
  const [fromBlock, setFromBlock] = useState("");
  const [toBlock, setToBlock] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [memoSigners, setMemoSigners] = useState("");
  const [rpc, setRpc] = useState(() => rpcOverride("arc-mainnet"));
  const [availableDemos, setAvailableDemos] = useState<NetworkId[] | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ pct: number | null; stage: string }>({ pct: null, stage: "" });
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [tab, setTab] = useState<Tab>("items");
  const [filter, setFilter] = useState<Filter>("all");
  const autoDemo = useRef(hashFlags().has("demo"));

  useEffect(() => {
    Promise.all(DEMOS.map(async (d) => ((await headOk(d.file)) ? d.id : null))).then((ids) =>
      setAvailableDemos(ids.filter((x): x is NetworkId => !!x)),
    );
  }, []);

  useEffect(() => {
    setRpc(rpcOverride(networkId));
  }, [networkId]);

  // "#/console?demo" loads the best available demo and reconciles it immediately.
  useEffect(() => {
    if (!autoDemo.current || !availableDemos || ledgers.length) return;
    const first = availableDemos[0];
    if (!first) return;
    autoDemo.current = false;
    void loadDemo(first).then((l) => l && run([l]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableDemos]);

  /** Replace or extend the loaded ledgers. Everything scanned must belong to one wallet on one network. */
  function applyLedgers(next: LoadedLedger[], mode: "replace" | "append") {
    const all = mode === "replace" ? next : [...ledgers, ...next];
    const first = all[0];
    if (!first) return;
    setLedgers(all);
    if (first.network) setNetworkId(first.network);
    if (first.payer) setAccount(first.payer);
    const froms = all.map((l) => l.scan?.fromBlock ?? l.execution?.blockNumber).filter((x): x is string => !!x).map(BigInt);
    const tos = all.map((l) => l.scan?.toBlock ?? l.execution?.blockNumber).filter((x): x is string => !!x).map(BigInt);
    setFromBlock(froms.length ? froms.reduce((a, b) => (a < b ? a : b)).toString() : "");
    setToBlock(tos.length ? tos.reduce((a, b) => (a > b ? a : b)).toString() : "");
    setFromDate("");
    setToDate("");
    const signers = all.flatMap((l) => l.memoSigners ?? []);
    if (signers.length) setMemoSigners(signers.join(", "));
    setResult(null);
    setError(null);
  }

  useEffect(() => {
    if (!handoff) return;
    applyLedgers([handoff.ledger], "replace");
    if (handoff.autorun) void run([handoff.ledger]);
    onHandoffUsed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handoff]);

  async function loadDemo(id: NetworkId): Promise<LoadedLedger | null> {
    try {
      const demo = DEMOS.find((d) => d.id === id)!;
      const res = await fetch(demo.file);
      const l = { ...((await res.json()) as LoadedLedger), snapshotUrl: demo.snapshot };
      applyLedgers([l], "replace");
      return l;
    } catch (e) {
      setError(`Could not load demo: ${friendly(e)}`);
      return null;
    }
  }

  async function onFile(file: File) {
    try {
      const parsed = await readLedgerFile(file);
      const payer = (parsed.payer ?? account) as Address;
      const l: LoadedLedger = {
        PmtInfId: parsed.PmtInfId ?? file.name.replace(/\.[^.]+$/, ""),
        network: parsed.network ?? networkId,
        payer,
        createdAt: parsed.createdAt ?? new Date().toISOString(),
        // A receivable row may omit its recipient: it is this wallet.
        instructions: parsed.instructions.map((i) => (i.direction === "in" && !i.recipient && isAddress(payer) ? { ...i, recipient: payer } : i)),
        execution: parsed.execution,
        scan: parsed.scan,
        description: parsed.description,
        memoSigners: parsed.memoSigners,
      };
      if (ledgers.length && ledgers.some((x) => x.PmtInfId === l.PmtInfId)) throw new Error(`A ledger with run id ${l.PmtInfId} is already loaded`);
      if (ledgers.length && ledgers[0]!.payer && l.payer && ledgers[0]!.payer.toLowerCase() !== l.payer.toLowerCase()) {
        throw new Error("All ledgers in one reconciliation must belong to the same wallet");
      }
      applyLedgers([l], ledgers.length ? "append" : "replace");
    } catch (e) {
      setError(`Could not read ledger: ${friendly(e)}`);
    }
  }

  async function applyPreset(hours: bigint) {
    try {
      const latest = await publicClientFor(networkId).getBlockNumber();
      const span = hours * BLOCKS_PER_HOUR;
      setFromBlock((latest > span ? latest - span : 0n).toString());
      setToBlock("");
      setFromDate("");
      setToDate("");
      setError(null);
    } catch (e) {
      setError(friendly(e));
    }
  }

  function useLedgerRange() {
    applyLedgers(ledgers, "replace");
  }

  /** Scan the chain (or fall back to the demo snapshot), then reconcile. Pass no ledgers for a plain statement of the wallet. */
  async function run(override?: LoadedLedger[], extraSigners: Address[] = []) {
    const ls = override ?? ledgers;
    const first = ls[0];
    const net = first?.network || networkId;
    const acct = first?.payer || account;
    setError(null);
    setResult(null);
    if (!isAddress(acct)) return setError(ls.length ? "The ledger has no wallet address." : "Enter the wallet address, or load a ledger.");
    const signers = [...parseAddresses(memoSigners), ...extraSigners];
    setRunning(true);
    setProgress({ pct: null, stage: "connecting to Arc" });
    try {
      let activity: AccountActivity;
      let source: Source = { kind: "live" };
      try {
        const client = publicClientFor(net);
        const latest = await client.getBlockNumber();
        let to: bigint;
        let from: bigint;
        const scanFrom = override ? first?.scan?.fromBlock : fromBlock;
        const scanTo = override ? first?.scan?.toBlock : toBlock;
        if (!override && fromDate && toDate && !scanFrom && !scanTo) {
          setProgress({ pct: null, stage: "finding blocks for those dates" });
          ({ fromBlock: from, toBlock: to } = await blockRangeForDates(client, fromDate, toDate));
        } else {
          to = scanTo ? BigInt(scanTo) : latest;
          from = scanFrom ? BigInt(scanFrom) : to > BLOCKS_PER_HOUR * 24n ? to - BLOCKS_PER_HOUR * 24n : 0n;
        }
        if (from > to) throw new Error("From block must not be after to block");
        if (to - from > MAX_RANGE) throw new Error(`Range too large for a browser scan (max ${MAX_RANGE.toLocaleString("en-US")} blocks, about 28 hours). Narrow it, or use an indexer.`);
        setProgress({ pct: 0, stage: "reading transfers and memos" });
        activity = await observeAccount({
          client,
          network: NETWORKS[net],
          account: acct as Address,
          fromBlock: from,
          toBlock: to,
          memoSenders: signers,
          onProgress: (done, total) => setProgress({ pct: Number((done * 100n) / (total || 1n)), stage: "reading transfers and memos" }),
        });
      } catch (liveError) {
        // Demos ship a frozen scan so the page still works when the public RPC is down.
        if (!first?.snapshotUrl) throw liveError;
        const res = await fetch(first.snapshotUrl);
        if (!res.ok) throw liveError;
        const snap = parseActivity(await res.text());
        activity = snap.activity;
        source = { kind: "snapshot", takenAt: snap.takenAt, reason: friendly(liveError) };
      }
      setProgress({ pct: 100, stage: "reconciling" });
      const { report, journal } = compute(activity, ls, signers, []);
      setResult({ report, activity, journal, networkId: net, source, ledgers: ls, signers, decisions: [] });
      setTab("items");
      setFilter("all");
    } catch (e) {
      setError(friendly(e));
    } finally {
      setRunning(false);
    }
  }

  /** A person settles an ambiguous entry with one candidate. Recomputed from the cached scan, recorded in the audit bundle. */
  function decide(d: Decision) {
    if (!result) return;
    const decisions = [...result.decisions.filter((x) => x.EndToEndId !== d.EndToEndId), d];
    const { report, journal } = compute(result.activity, result.ledgers, result.signers, decisions);
    setResult({ ...result, report, journal, decisions });
  }

  function undoDecision(EndToEndId: string) {
    if (!result) return;
    const decisions = result.decisions.filter((x) => x.EndToEndId !== EndToEndId);
    const { report, journal } = compute(result.activity, result.ledgers, result.signers, decisions);
    setResult({ ...result, report, journal, decisions });
  }

  const totalEntries = ledgers.reduce((s, l) => s + l.instructions.length, 0);
  const statementMode = ledgers.length === 0;
  const rangeSummary = fromDate && toDate ? `${fromDate} → ${toDate}` : fromBlock || toBlock ? `blocks ${fromBlock || "…"} → ${toBlock || "latest"}` : "last 24 hours";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Reconcile"
        title="Reconcile a wallet against your ledger"
        lead="Everything runs in your browser against a public Arc RPC. Your ledger never leaves this page. No ledger? Enter a wallet and get a statement with a balance roll-forward instead."
      />

      <section className="card divide-y divide-slate-100">
        <div className="space-y-3 p-5">
          <div className="flex flex-wrap items-center gap-2">
            {availableDemos === null && <span className="text-sm text-slate-500">Checking for demo ledgers…</span>}
            {availableDemos?.map((id) => (
              <button key={id} className={id === "arc-mainnet" ? "btn-primary" : "btn-secondary"} disabled={running} onClick={() => loadDemo(id).then((l) => l && run([l]))}>
                Run PromptBazaar demo · {NETWORKS[id].name}
              </button>
            ))}
            <label className="btn-secondary cursor-pointer">
              {ledgers.length ? "Add another ledger" : "Upload ledger (CSV or JSON)"}
              <input type="file" accept=".csv,.json" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
            </label>
            {ledgers.length > 0 && <button className="btn-ghost" onClick={() => { setLedgers([]); setResult(null); }}>Clear</button>}
          </div>
          {ledgers.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {ledgers.map((l) => (
                <span key={l.PmtInfId} className="chip max-w-full flex-wrap gap-x-2 py-1.5">
                  <span className="font-semibold whitespace-nowrap text-slate-900">{l.PmtInfId}</span>
                  <span className="whitespace-nowrap text-slate-500">{l.instructions.length} entries</span>
                  {l.description ? <span className="text-slate-500">· {l.description}</span> : null}
                </span>
              ))}
              {ledgers.length > 1 && <span className="text-xs text-slate-500">{totalEntries} entries across {ledgers.length} ledgers</span>}
            </div>
          )}
        </div>

        <form
          className="grid gap-4 p-5 md:grid-cols-12"
          onSubmit={(e) => {
            e.preventDefault();
            if (!running && (ledgers.length || isAddress(account))) void run();
          }}
        >
          <Field label="Network" className="md:col-span-3">
            <select className="input" value={networkId} onChange={(e) => setNetworkId(e.target.value as NetworkId)}>
              {Object.values(NETWORKS).map((n) => (
                <option key={n.id} value={n.id}>{n.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Wallet" className="md:col-span-9">
            <input className="input font-mono" placeholder="0x… the paying or receiving wallet" value={account} onChange={(e) => setAccount(e.target.value.trim())} spellCheck={false} />
          </Field>
          <div className="md:col-span-12">
            <Collapsible title="Scan range and advanced options" summary={<span>{rangeSummary}</span>}>
              <div className="grid gap-4 md:grid-cols-12">
                <div className="md:col-span-12 flex flex-wrap items-center gap-2">
                  {PRESETS.map((p) => (
                    <button key={p.label} type="button" className="chip hover:border-slate-300 hover:bg-slate-50" onClick={() => void applyPreset(p.hours)}>{p.label}</button>
                  ))}
                  {ledgers.some((l) => l.scan || l.execution) && (
                    <button type="button" className="chip hover:border-slate-300 hover:bg-slate-50" onClick={useLedgerRange}>Ledger's own range</button>
                  )}
                  <span className="text-xs text-slate-500">Arc produces about two blocks a second; a browser scan covers at most {MAX_RANGE.toLocaleString("en-US")} blocks.</span>
                </div>
                <Field label="From block" className="md:col-span-3">
                  <input className="input font-mono" placeholder="latest − 172,800" value={fromBlock} onChange={(e) => setFromBlock(e.target.value.trim())} />
                </Field>
                <Field label="To block" className="md:col-span-3">
                  <input className="input font-mono" placeholder="latest" value={toBlock} onChange={(e) => setToBlock(e.target.value.trim())} />
                </Field>
                <Field label="Or from date (UTC)" className="md:col-span-3">
                  <input className="input" type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setFromBlock(""); setToBlock(""); }} />
                </Field>
                <Field label="To date (UTC)" className="md:col-span-3">
                  <input className="input" type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setFromBlock(""); setToBlock(""); }} />
                </Field>
                <Field label="Reference signers" hint="EOAs that publish on-chain references for this wallet's payments, for example your operations wallet attesting a Safe's payouts." className="md:col-span-6">
                  <input className="input font-mono" placeholder="0x…, 0x…" value={memoSigners} onChange={(e) => setMemoSigners(e.target.value)} spellCheck={false} />
                </Field>
                <Field label="RPC URL" hint="Your own node or a provider key avoids public rate limits and keeps the address you query off a shared endpoint. Stays in this browser." className="md:col-span-6">
                  <input className="input font-mono" placeholder={`${NETWORKS[networkId].rpcUrl} (public default)`} value={rpc} onChange={(e) => setRpc(e.target.value)} onBlur={() => setRpcOverride(networkId, rpc)} spellCheck={false} />
                </Field>
              </div>
            </Collapsible>
          </div>
          <div className="md:col-span-12 flex flex-wrap items-center gap-4">
            <button type="submit" className="btn-primary" disabled={running || (!ledgers.length && !isAddress(account))}>
              {running ? "Scanning Arc…" : statementMode ? "Statement for this wallet" : "Reconcile"}
            </button>
            {running && <ProgressBar value={progress.pct} label={progress.stage} />}
            {!running && statementMode && isAddress(account) && <span className="text-xs text-slate-500">No ledger loaded: you will get every movement, the roll-forward and the exports.</span>}
          </div>
        </form>
      </section>

      {error && <Notice tone="error">{error}</Notice>}
      {ledgers[0]?.scenario && <ScenarioGuide ledger={ledgers[0]} />}
      {!result && !running && !error && (
        <EmptyState title="Nothing reconciled yet" body="Run the demo, upload a ledger, or paste a wallet address and ask for a statement.">
          {availableDemos?.[0] && (
            <button className="btn-secondary" onClick={() => loadDemo(availableDemos[0]!).then((l) => l && run([l]))}>Run the PromptBazaar demo</button>
          )}
        </EmptyState>
      )}
      {result && (
        <Results
          result={result}
          tab={tab}
          setTab={setTab}
          filter={filter}
          setFilter={setFilter}
          onDecide={decide}
          onUndo={undoDecision}
          onReferencesPublished={(signer) => {
            const current = parseAddresses(memoSigners);
            if (!current.some((a) => a.toLowerCase() === signer.toLowerCase())) setMemoSigners([...current, signer].join(", "));
            void run(undefined, [signer]);
          }}
        />
      )}
    </div>
  );
}

/** What a reviewer should expect to see in the PromptBazaar demo, with the real transactions behind each case. */
function ScenarioGuide({ ledger }: { ledger: LoadedLedger }) {
  const network = NETWORKS[ledger.network];
  const s = ledger.scenario ?? {};
  const rows: Array<{ what: string; expect: ReconStatus; link?: string; id?: string }> = [
    { what: "Sellers paid in one batch, each with an ISO 20022 memo and a run anchor", expect: "matched", link: s.batchTx },
    { what: "One seller paid by a plain transfer with no memo, as a Safe or MPC wallet would", expect: "matched_by_intent", link: s.manualNoMemoTx },
    ...(s.referenceTx
      ? [{ what: "One seller paid by a plain transfer, then the operations wallet published an on-chain reference for it", expect: "matched" as const, link: s.referenceTx }]
      : []),
    { what: "One seller on hold, never paid", expect: "missing", id: s.onHold },
    { what: "A ledger amount edited after the run; the on-chain anchor pinpoints which entry changed", expect: "mismatch", id: s.editedAfterRun },
    { what: "Treasury sent funds to an address the ledger does not know", expect: "unexpected", link: s.unrecordedTx },
    ...(s.invoicePaidTx ? [{ what: "A seller paid a PromptBazaar invoice with a memo (money in, matched to a receivable)", expect: "matched" as const, link: s.invoicePaidTx }] : []),
    ...(s.invoiceOpen ? [{ what: "An invoice PromptBazaar issued that nobody has paid yet", expect: "missing" as const, id: s.invoiceOpen }] : []),
    ...(s.unrecordedIncomingTx ? [{ what: "Someone sent USDC to the treasury with a plain wallet send and no invoice", expect: "unexpected" as const, link: s.unrecordedIncomingTx }] : []),
  ];
  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">What this demo shows</h2>
        <span className="text-xs text-slate-500">
          PromptBazaar is a fictional marketplace. Every transaction below is a real {network.name} transaction from{" "}
          <Mono value={ledger.payer} href={addressUrl(network, ledger.payer)} />.
        </span>
      </div>
      <ul className="mt-3 divide-y divide-slate-100 text-sm">
        {rows.map((r) => (
          <li key={r.what} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
            <span className="text-slate-700">{r.what}{r.id ? <span className="ml-1.5 font-mono text-xs text-slate-500">{r.id}</span> : null}</span>
            <span className="flex items-center gap-3">
              {r.link && <Mono value={r.link} href={txUrl(network, r.link)} />}
              <StatusBadge status={r.expect} />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Everything needed to re-run and re-check this reconciliation later, in one file. */
function auditBundle(result: Result): string {
  const { report, activity, ledgers, networkId, source, signers, decisions } = result;
  const bigint = (_k: string, v: unknown) => (typeof v === "bigint" ? v.toString() : v);
  const body = {
    tieout: { version: 1, generatedAt: report.generatedAt, network: networkId, account: report.account, source, trustedReferenceSigners: [report.account, ...signers] },
    ledgers: ledgers.map(({ snapshotUrl: _s, ...l }) => l),
    decisions,
    activity: JSON.parse(serializeActivity(activity, new Date(report.generatedAt))).activity,
    report: {
      summary: report.summary,
      anchors: report.anchors,
      rollForward: report.rollForward,
      ignoredIncoming: report.ignoredIncoming,
      danglingReferences: report.danglingReferences,
      items: report.items.map((i) => ({
        status: i.status,
        direction: i.direction,
        evidence: i.evidence,
        EndToEndId: i.instruction?.EndToEndId,
        PmtInfId: i.instruction?.PmtInfId,
        txHash: i.transfer?.txHash,
        logIndex: i.transfer?.logIndex,
        amount: i.transfer ? fromUnits(i.transfer.amount) : undefined,
        varianceUnits: i.varianceUnits,
        reference: i.reference ? { txHash: i.reference.txHash, sender: i.reference.sender } : undefined,
        candidates: i.candidates?.map((c) => ({ txHash: c.txHash, logIndex: c.logIndex })),
        candidateIds: i.candidateIds,
        notes: i.notes,
      })),
    },
  };
  return JSON.stringify(body, bigint, 2) + "\n";
}

function Results({
  result,
  tab,
  setTab,
  filter,
  setFilter,
  onDecide,
  onUndo,
  onReferencesPublished,
}: {
  result: Result;
  tab: Tab;
  setTab: (t: Tab) => void;
  filter: Filter;
  setFilter: (f: Filter) => void;
  onDecide: (d: Decision) => void;
  onUndo: (EndToEndId: string) => void;
  onReferencesPublished: (signer: Address) => void;
}) {
  const { report, activity, journal, source, decisions } = result;
  const network = NETWORKS[result.networkId];
  const s = report.summary;
  const exceptions = s.mismatch + s.ambiguous + s.missing + s.duplicate + s.unexpected;
  const statementMode = result.ledgers.length === 0;
  const items = useMemo(
    () => report.items.filter((i) => (filter === "all" ? true : filter === "exceptions" ? isException(i.status) : i.status === filter)),
    [report, filter],
  );
  const intentItems = report.items.filter((i) => i.status === "matched_by_intent" && i.transfer && i.instruction);
  const rows = report.rollForward?.filter((b) => b.opening !== 0n || b.closing !== 0n || b.inflow !== 0n || b.outflow !== 0n) ?? [];

  return (
    <div className="space-y-6">
      {source.kind === "snapshot" && (
        <Notice tone="warn">
          The live RPC scan failed ({source.reason}). Showing a snapshot of the same block range taken {source.takenAt.slice(0, 16).replace("T", " ")} UTC.
          Every transaction link below still points at the live explorer.
        </Notice>
      )}
      {statementMode && (
        <Notice>
          Statement mode: no ledger loaded, so every movement is listed as unexpected and booked to suspense. Use it to see what a wallet did, check the balance
          roll-forward, or export a camt.054 for a treasury system. Load a ledger to reconcile.
        </Notice>
      )}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Expected" value={fmt(fromUnits(s.expectedUnits))} hint={`${report.items.filter((i) => i.instruction).length} ledger entries · USDC`} />
        <Stat
          label="Settled"
          tone="good"
          value={fmt(fromUnits(s.settledUnits))}
          hint={`${s.byEvidence.memo} by memo · ${s.byEvidence.reference} by reference · ${s.byEvidence.manual} by hand · ${s.byEvidence.intent} by intent`}
        />
        <Stat label="Exceptions" tone={exceptions ? "bad" : "good"} value={exceptions} hint={`${fmt(fromUnits(s.exceptionUnits))} USDC needs review`} />
        <Stat label="Network fees" value={fmt(formatUnits(report.feesWei, 18), 6)} hint={`USDC across ${activity.fees.length} transaction${activity.fees.length === 1 ? "" : "s"}`} />
        <div className="card p-4">
          <div className="text-[11px] font-semibold tracking-[0.12em] text-slate-500 uppercase">Run anchor{report.anchors.length === 1 ? "" : "s"}</div>
          <div className="mt-2 space-y-1.5">
            {report.anchors.length === 0 && <span className="text-xs text-slate-500">No ledger runs</span>}
            {report.anchors.map((a) => (
              <div key={a.PmtInfId} className="space-y-1">
                <AnchorBadge status={a.status} />
                {a.observed && <div><Mono value={a.observed.txHash} href={txUrl(network, a.observed.txHash)} /></div>}
                {a.notes.map((n) => <div key={n} className="text-xs leading-relaxed text-rose-700">{n}</div>)}
              </div>
            ))}
          </div>
        </div>
      </section>

      {rows.length > 0 && (
        <section className="card p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold">Balance roll-forward</h2>
            <span className="text-xs text-slate-500">Opening + receipts − payments − fees should equal closing. Anything else is money the scan did not explain.</span>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="nums w-full text-sm">
              <thead className="table-head">
                <tr>
                  <th className="py-2 pr-3 text-left">Token</th><th className="py-2 px-3 text-right">Opening</th><th className="py-2 px-3 text-right">Receipts</th><th className="py-2 px-3 text-right">Payments</th><th className="py-2 px-3 text-right">Fees</th><th className="py-2 px-3 text-right">Expected closing</th><th className="py-2 px-3 text-right">On-chain closing</th><th className="py-2 pl-3 text-right">Unexplained</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((b) => {
                  const ok = (b.unexplainedWei ?? b.unexplained) === 0n;
                  return (
                    <tr key={b.token}>
                      <td className="py-2.5 pr-3 font-medium">{b.token}</td>
                      <td className="py-2.5 px-3 text-right">{fmt(fromUnits(b.opening))}</td>
                      <td className="py-2.5 px-3 text-right">{fmt(fromUnits(b.inflow))}</td>
                      <td className="py-2.5 px-3 text-right">{fmt(fromUnits(b.outflow))}</td>
                      <td className="py-2.5 px-3 text-right">{fmt(fromUnits(b.fees))}</td>
                      <td className="py-2.5 px-3 text-right">{fmt(fromUnits(b.expectedClosing))}</td>
                      <td className="py-2.5 px-3 text-right">{fmt(fromUnits(b.closing))}</td>
                      <td className={`py-2.5 pl-3 text-right font-semibold ${ok ? "text-emerald-700" : "text-rose-700"}`}>
                        {ok ? "0 · fully explained" : b.unexplainedWei !== undefined ? fmt(formatUnits(b.unexplainedWei, 18), 18) : fmt(fromUnits(b.unexplained))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {report.ignoredIncoming.count > 0 && (
        <Notice>
          {report.ignoredIncoming.count} incoming transfer{report.ignoredIncoming.count === 1 ? "" : "s"} ({fmt(fromUnits(report.ignoredIncoming.units))} USDC) left out because this ledger has no receivables.
          Add entries with <code className="font-mono text-xs">direction: "in"</code> to reconcile money coming in as well.
        </Notice>
      )}

      {report.danglingReferences.length > 0 && (
        <Notice tone="warn">
          {report.danglingReferences.length} trusted reference{report.danglingReferences.length === 1 ? "" : "s"} could not be used:{" "}
          {report.danglingReferences.map((d) => `${d.EndToEndId} (${d.reason === "unknown_id" ? "no such entry in the ledger" : "its transaction is outside the scanned range"})`).join("; ")}.
          Widen the range or load the ledger that contains those entries.
        </Notice>
      )}

      {decisions.length > 0 && (
        <Notice tone="warn">
          {decisions.length} pairing{decisions.length === 1 ? "" : "s"} settled by hand this session. They are recorded in the audit bundle and shown as evidence "manual";
          publishing references for them makes the decision permanent on-chain.
        </Notice>
      )}

      {intentItems.length > 0 && <AttachReferences items={intentItems} networkId={result.networkId} onPublished={onReferencesPublished} />}

      <div className="text-xs text-slate-500">
        {source.kind === "live" ? "Scanned" : "Snapshot of"} blocks <span className="nums">{activity.fromBlock.toString()}–{activity.toBlock.toString()}</span> on {network.name} for{" "}
        <Mono value={activity.account} href={addressUrl(network, activity.account)} /> ·{" "}
        {activity.transfers.length} transfers · {activity.anchors.length} anchor{activity.anchors.length === 1 ? "" : "s"} · {activity.references.length} reference{activity.references.length === 1 ? "" : "s"}
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {(["items", "journal", "export"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition ${tab === t ? "border-ink text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"}`}
          >
            {{ items: statementMode ? "Statement" : "Reconciliation", journal: "Journal entries", export: "Export" }[t]}
          </button>
        ))}
      </div>

      {tab === "items" && (
        <section className="space-y-3">
          <div className="flex flex-wrap gap-2 text-sm">
            {(["all", "exceptions", "matched", "matched_by_intent", "mismatch", "ambiguous", "missing", "duplicate", "unexpected"] as Filter[]).map((f) => {
              const count = f === "all" ? report.items.length : f === "exceptions" ? exceptions : s[f];
              if (f !== "all" && f !== "exceptions" && count === 0) return null;
              return (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`nums rounded-full px-3 py-1 text-sm ring-1 transition ${filter === f ? "bg-ink text-white ring-ink" : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"}`}
                >
                  {f === "all" ? "All" : f === "exceptions" ? "Exceptions" : <StatusLabel status={f} />} · {count}
                </button>
              );
            })}
          </div>
          <div className="card overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="table-head">
                <tr>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Payment</th>
                  <th className="px-4 py-3">Counterparty</th>
                  <th className="px-4 py-3 text-right">Ledger</th>
                  <th className="px-4 py-3 text-right">On-chain</th>
                  <th className="px-4 py-3">Transaction</th>
                  <th className="px-4 py-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item, idx) => {
                  const t = item.transfer;
                  const decided = item.evidence === "manual" && item.instruction ? decisions.find((d) => d.EndToEndId === item.instruction!.EndToEndId) : undefined;
                  return (
                    <tr key={idx} className={`transition hover:bg-slate-50/60 ${isException(item.status) ? "bg-rose-50/30" : ""}`}>
                      <td className="px-4 py-3 align-top" title={STATUS_HELP[item.status]}>
                        <StatusBadge status={item.status} />
                        <div className={`mt-1 text-[11px] ${item.direction === "in" ? "text-emerald-700" : "text-slate-400"}`}>{item.direction === "in" ? "money in" : "money out"}</div>
                      </td>
                      <td className="px-4 py-3 align-top font-mono text-xs">
                        {item.instruction?.EndToEndId ?? (t?.memo?.decoded.kind === "payment" ? t.memo.decoded.memo.EndToEndId : item.candidateIds ? item.candidateIds.join(" / ") : "—")}
                        <EvidenceLabel item={item} />
                        {decided && <button className="mt-1 block font-sans text-[11px] text-slate-500 underline" onClick={() => onUndo(decided.EndToEndId)}>undo decision</button>}
                      </td>
                      <td className="px-4 py-3 align-top">
                        {item.instruction?.payeeName ?? <span className="text-slate-400">Unknown</span>}
                        <div className="mt-0.5"><Mono value={((item.direction === "in" ? (t?.from ?? item.instruction?.payer) : (t?.to ?? item.instruction?.recipient)) ?? "")} /></div>
                      </td>
                      <td className="nums px-4 py-3 text-right align-top">{item.instruction ? fmt(item.instruction.amount) : "—"}</td>
                      <td className="nums px-4 py-3 text-right align-top">{t ? fmt(fromUnits(t.amount)) : "—"}</td>
                      <td className="px-4 py-3 align-top">
                        {t ? <Mono value={t.txHash} href={txUrl(network, t.txHash)} /> : item.candidates && item.instruction ? (
                          <div className="space-y-1.5">
                            {item.candidates.map((c) => (
                              <div key={`${c.txHash}:${c.logIndex}`} className="flex items-center gap-2">
                                <Mono value={c.txHash} href={txUrl(network, c.txHash)} />
                                <button
                                  className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] font-medium text-slate-700 transition hover:bg-slate-50"
                                  onClick={() => onDecide({ EndToEndId: item.instruction!.EndToEndId, txHash: c.txHash, logIndex: c.logIndex, note: "chosen in Tieout" })}
                                >
                                  settle with this
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3 align-top text-xs leading-relaxed text-slate-600">{item.notes.join("; ")}</td>
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
            Templates for an accountant to review. Cleared payouts debit <b>Payouts payable</b>, cleared receipts credit <b>Receivables</b>; exceptions go to <b>Suspense</b> until resolved; network fees are booked once per day.
          </Notice>
          <div className="card overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="table-head">
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
                      <td className="nums px-4 py-2 align-top text-xs whitespace-nowrap text-slate-500">{j === 0 ? entry.date : ""}</td>
                      <td className="px-4 py-2 align-top text-xs">{j === 0 ? entry.narration : ""}</td>
                      <td className={`px-4 py-2 align-top text-xs ${Number(l.credit) > 0 ? "pl-10" : ""}`}>
                        <span className="font-mono text-slate-500">{l.account}</span> {l.accountName}
                      </td>
                      <td className="nums px-4 py-2 text-right align-top">{Number(l.debit) > 0 ? fmt(l.debit) : ""}</td>
                      <td className="nums px-4 py-2 text-right align-top">{Number(l.credit) > 0 ? fmt(l.credit) : ""}</td>
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
            title="Audit bundle (JSON)"
            body="Ledgers, the full chain scan, every decision and every outcome in one file. `npm run verify-bundle` recomputes it and, with --rescan, checks the chain still agrees."
            label="Download JSON"
            onClick={() => download(`tieout-audit-${report.account.slice(2, 8)}-${report.generatedAt.slice(0, 10)}.json`, auditBundle(result), "application/json")}
          />
          <ExportCard
            title="Reconciliation report"
            body="One row per payment and exception, with explorer links. For review and audit files."
            onClick={() => download(`tieout-reconciliation-${report.account.slice(2, 8)}.csv`, reconReportCsv(report, network.explorerUrl))}
          />
          <ExportCard
            title="Journal (generic CSV)"
            body="Double-entry lines with account codes, 6-decimal amounts and transaction hashes."
            onClick={() => download(`tieout-journal-${report.account.slice(2, 8)}.csv`, journalCsv(journal))}
          />
          <ExportCard
            title="Xero manual journal import"
            body="Xero 'Import manual journals' layout. USDC lines only, rounded to cents. In Xero, set the USDC wallet up as a current asset, not a bank account."
            onClick={() => download(`tieout-xero-${report.account.slice(2, 8)}.csv`, xeroManualJournalCsv(journal))}
          />
          <ExportCard
            title="QuickBooks Online journal import"
            body="QBO 'Import journal entries' layout: account names, MM/dd/yyyy dates, balanced debits and credits, transaction hash in the description."
            onClick={() => download(`tieout-qbo-${report.account.slice(2, 8)}.csv`, qboJournalCsv(journal))}
          />
          <ExportCard
            title="ISO 20022 camt.054 (XML)"
            body="Bank-style debit/credit notification for the wallet, the same message family Circle Mint uses for statements. Carries EndToEndId, creditor reference, purpose code and the transaction hash per entry."
            label="Download XML"
            onClick={() => download(`tieout-camt054-${report.account.slice(2, 8)}.xml`, camt054Xml(report), "application/xml")}
          />
        </section>
      )}
    </div>
  );
}

function EvidenceLabel({ item }: { item: ReconItem }) {
  const t = item.transfer;
  if (!t) return null;
  if (item.evidence === "memo" || t.memo?.decoded.kind === "payment") return <div className="mt-1 font-sans text-[11px] text-emerald-700">memo on-chain</div>;
  if (item.evidence === "reference") return <div className="mt-1 font-sans text-[11px] text-emerald-700">reference on-chain</div>;
  if (item.evidence === "manual") return <div className="mt-1 font-sans text-[11px] text-amber-700">settled by hand</div>;
  return <div className="mt-1 font-sans text-[11px] text-slate-400">{t.native ? "native send, no memo" : "no memo"}</div>;
}

/**
 * Turns weak evidence into strong evidence: publishes one reference memo per
 * intent-matched item, signed by whatever EOA is connected. The references
 * share the payment memoIds, so from then on the Verify page, auditors and
 * every future reconciliation find these payments by their ids.
 */
function AttachReferences({ items, networkId, onPublished }: { items: ReconItem[]; networkId: NetworkId; onPublished: (signer: Address) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ hash: Hex; signer: Address } | null>(null);
  const network = NETWORKS[networkId];

  async function publish() {
    setError(null);
    const provider = injectedProvider();
    if (!provider) return setError("No browser wallet found. Install MetaMask, Rabby or another EIP-1193 wallet.");
    try {
      setBusy("Connecting…");
      const [signer] = (await provider.request({ method: "eth_requestAccounts" })) as Address[];
      if (!signer) throw new Error("No account");
      await ensureNetwork(provider, networkId);
      const plan = buildReferenceBatch({
        network,
        signer,
        references: items.map((i) => ({ EndToEndId: i.instruction!.EndToEndId, TxHash: i.transfer!.txHash, PmtInfId: i.instruction!.PmtInfId })),
      });
      const client = publicClientFor(networkId);
      await client.call({ account: signer, to: plan.to, data: plan.data });
      setBusy("Waiting for wallet signature…");
      const wallet = createWalletClient({ chain: toViemChain(network), transport: custom(provider), account: signer });
      const hash = await wallet.sendTransaction({ to: plan.to, data: plan.data, maxFeePerGas: MIN_MAX_FEE_PER_GAS * 3n, maxPriorityFeePerGas: 1_000_000_000n });
      setBusy("Confirming on Arc…");
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Transaction reverted");
      setSent({ hash, signer });
    } catch (e) {
      setError(friendly(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card flex flex-wrap items-center justify-between gap-4 p-5">
      <div className="min-w-0 flex-1 text-sm">
        <div className="font-semibold">{items.length} payment{items.length === 1 ? "" : "s"} matched by intent only</div>
        <div className="mt-1 text-xs leading-relaxed text-slate-600">
          Publish on-chain references for them from any EOA (your ops wallet, for example). Each reference names the transaction and the EndToEndId, shares the
          payment's memoId, and costs about the same as one transfer. From then on these are first-class evidence, findable by id.
        </div>
        {error && <div className="mt-1 text-xs text-rose-700">{error}</div>}
        {sent && (
          <div className="mt-1 text-xs text-emerald-700">
            Published in <ExternalLink href={txUrl(network, sent.hash)} className="font-mono">{sent.hash.slice(0, 10)}…</ExternalLink> by <span className="font-mono">{sent.signer.slice(0, 8)}…</span>.
          </div>
        )}
      </div>
      {sent ? (
        <button className="btn-primary" onClick={() => onPublished(sent.signer)}>Re-run with this signer trusted</button>
      ) : (
        <button className="btn-secondary" disabled={!!busy} onClick={publish}>{busy ?? `Attach ${items.length} reference${items.length === 1 ? "" : "s"} on-chain`}</button>
      )}
    </section>
  );
}

function StatusLabel({ status }: { status: ReconStatus }) {
  return <>{{ matched: "Matched", matched_by_intent: "By intent", mismatch: "Mismatch", ambiguous: "Ambiguous", missing: "Not paid", duplicate: "Duplicate", unexpected: "Unexpected" }[status]}</>;
}

function ExportCard({ title, body, onClick, label = "Download CSV" }: { title: string; body: string; onClick: () => void; label?: string }) {
  return (
    <div className="card flex flex-col justify-between gap-4 p-5">
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{body}</p>
      </div>
      <button className="btn-secondary self-start" onClick={onClick}>{label}</button>
    </div>
  );
}
