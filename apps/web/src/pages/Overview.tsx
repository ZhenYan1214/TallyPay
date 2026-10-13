import type { CSSProperties, ReactNode } from "react";
import { navigate, REPO_URL } from "../App.tsx";
import { ExternalLink, StatusBadge } from "../components/ui.tsx";
import type { ReconStatus } from "@tieout/recon";

const MAINNET_BATCH = "0x252dd1ff0f0ad77cb2d9fde109cd96de409521d52fbd662e4a9907eed684379e";

const STEPS = [
  { title: "Pay", body: "Send a batch from your own wallet. Each transfer carries a memo with its payout or invoice ID." },
  {
    title: "Reconcile",
    body: "Tieout reads the wallet on Arc and matches every transfer to a line in your ledger. Payments without a memo are matched on amount and recipient, only when there is exactly one candidate.",
  },
  { title: "Export", body: "Journal entries for Xero or QuickBooks, a camt.054 file for a treasury system, or an audit file anyone can re-run." },
];

/** Outcome counts from reconciling the mainnet demo run PB-202610-I7JR. */
const OUTCOMES: Array<[ReconStatus, number]> = [
  ["matched", 10],
  ["matched_by_intent", 1],
  ["mismatch", 1],
  ["ambiguous", 0],
  ["missing", 2],
  ["duplicate", 0],
  ["unexpected", 2],
];

const FIGURES: Array<{ n: string; body: string; src: string; href: string }> = [
  {
    n: "70%",
    body: "of companies surveyed say ERP integration would speed up their stablecoin adoption.",
    src: "EY-Parthenon",
    href: "https://www.ey.com/en_us/insights/financial-services/cost-savings-and-speed-drive-stablecoin-adoption",
  },
  {
    n: "$226B",
    body: "in B2B stablecoin payments in 2025, money that has to land in someone's books.",
    src: "McKinsey, Artemis",
    href: "https://www.mckinsey.com/industries/financial-services/our-insights/stablecoins-in-payments-what-the-raw-transaction-numbers-miss",
  },
  {
    n: "0.88×",
    body: "the gas of a plain transfer, for a payment with a memo inside a batch.",
    src: "Measured on Arc mainnet",
    href: `https://explorer.arc.io/tx/${MAINNET_BATCH}`,
  },
];

const PREVIEW: Array<{ status: ReconStatus; id: string; who: string; note: string; amount: string }> = [
  { status: "matched", id: "S01", who: "Aiko Tanaka", note: "memo", amount: "0.184000" },
  { status: "matched", id: "S11", who: "Grace Mensah", note: "reference", amount: "0.120000" },
  { status: "matched_by_intent", id: "S07", who: "Minh Nguyen", note: "no memo", amount: "0.078000" },
  { status: "mismatch", id: "S04", who: "Priya Raman", note: "over by 0.015", amount: "0.150000" },
  { status: "missing", id: "S12", who: "Daniel Kim", note: "on hold", amount: "—" },
  { status: "unexpected", id: "in", who: "Unknown sender", note: "native send", amount: "0.010000" },
];

const stagger = (i: number) => ({ "--i": i } as CSSProperties);

function Check({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3.5 8.5l3 3 6-7" />
    </svg>
  );
}

/** The reconciliation result: six real rows of run PB-202610-I7JR on Arc mainnet. */
function ResultCard() {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(11,18,32,0.05),0_24px_48px_-24px_rgba(11,18,32,0.22)]">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div className="min-w-0">
          <div className="text-[13.5px] font-semibold text-slate-900">Reconciliation</div>
          <div className="truncate font-mono text-[11.5px] text-slate-500">PB-202610-I7JR · 0x2ccb42…e841</div>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-slate-200 px-2 py-1 text-[11.5px] text-slate-600">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
          Arc mainnet
        </span>
      </div>

      <dl className="grid grid-cols-3 border-b border-slate-200">
        {[
          ["Settled", "1.345", "text-slate-900"],
          ["Exceptions", "5", "text-rose-600"],
          ["Unexplained", "0.000000", "text-emerald-600"],
        ].map(([k, v, c], i) => (
          <div key={k} className={`px-4 py-3 ${i ? "border-l border-slate-200" : ""}`}>
            <dt className="text-[11.5px] text-slate-500">{k}</dt>
            <dd className={`nums mt-0.5 truncate text-[17px] font-semibold tracking-[-0.02em] ${c}`}>{v}</dd>
          </div>
        ))}
      </dl>

      <table className="w-full table-fixed text-[13px]">
        <colgroup>
          <col className="w-[8.5rem] sm:w-[9.5rem]" />
          <col />
          <col className="w-[5.75rem]" />
        </colgroup>
        <tbody className="divide-y divide-slate-100">
          {PREVIEW.map((r) => (
            <tr key={r.id + r.amount}>
              <td className="py-2.5 pl-4">
                <StatusBadge status={r.status} />
              </td>
              <td className="truncate py-2.5 pr-2 text-slate-700">
                <span className="mr-1.5 font-mono text-[11.5px] text-slate-400">{r.id}</span>
                <span className="hidden sm:inline">{r.who} · </span>
                <span className="text-slate-500">{r.note}</span>
              </td>
              <td className={`nums py-2.5 pr-4 text-right font-mono text-[12.5px] ${r.status === "mismatch" || r.status === "unexpected" ? "text-rose-600" : "text-slate-800"}`}>
                {r.amount}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-slate-200 bg-slate-50 px-4 py-2.5 font-mono text-[11.5px] text-slate-500">
        <span>4.912582 + 0.06 − 1.49 − 0.018344</span>
        <span className="inline-flex items-center gap-1 text-emerald-700">
          = 3.464238 on-chain <Check className="h-3 w-3" />
        </span>
      </div>
    </div>
  );
}

/** What the accountant receives for one matched payout. */
function JournalCard() {
  return (
    <div className="w-[17.5rem] rounded-xl border border-slate-200 bg-white p-3.5 shadow-[0_1px_2px_rgba(11,18,32,0.05),0_18px_40px_-20px_rgba(11,18,32,0.28)]">
      <div className="flex items-center justify-between text-[11.5px]">
        <span className="font-medium text-slate-800">Journal entry</span>
        <span className="font-mono text-slate-400">2026-10-13</span>
      </div>
      <div className="mt-0.5 truncate text-[11.5px] text-slate-500">Payout PB-202610-I7JR-S01 · Aiko Tanaka</div>
      <div className="mt-2.5 space-y-1 font-mono text-[11.5px]">
        <div className="flex justify-between gap-3">
          <span className="truncate text-slate-700">
            <span className="text-slate-400">2110</span> Payouts payable
          </span>
          <span className="text-slate-900">0.184000</span>
        </div>
        <div className="flex justify-between gap-3 pl-4">
          <span className="truncate text-slate-700">
            <span className="text-slate-400">1015</span> USDC wallet
          </span>
          <span className="text-slate-900">(0.184000)</span>
        </div>
      </div>
      <div className="mt-2.5 flex items-center gap-1.5 border-t border-slate-100 pt-2 text-[11px] text-slate-500">
        <span className="rounded border border-slate-200 px-1 py-px font-mono text-[10px] text-slate-600">CSV</span>
        Ready for Xero or QuickBooks
      </div>
    </div>
  );
}

function HeroVisual() {
  return (
    <figure className="rise relative min-w-0" style={stagger(2)}>
      <div className="relative rounded-2xl border border-slate-200/80 bg-slate-100/80 p-3 sm:p-5 lg:p-6 xl:pb-28">
        <ResultCard />
        {/* Floating details, desktop only: they would crowd a phone screen. */}
        <div className="pointer-events-none absolute right-10 -bottom-14 hidden xl:block">
          <JournalCard />
        </div>
      </div>
      <div className="pointer-events-none absolute -top-3 right-8 hidden items-center gap-1.5 rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-[12px] font-medium text-emerald-700 shadow-[0_8px_24px_-12px_rgba(11,18,32,0.25)] lg:inline-flex">
        <Check className="h-3 w-3" />
        Anchor verified on-chain
      </div>
      <figcaption className="mt-3 text-[12.5px] text-slate-500 xl:mt-4 xl:max-w-[14rem] xl:leading-relaxed">
        Six rows from a real run on Arc mainnet.{" "}
        <ExternalLink href={`https://explorer.arc.io/tx/${MAINNET_BATCH}`}>View on Arcscan</ExternalLink>
      </figcaption>
    </figure>
  );
}

/** Real call shapes and memo format, set as code. */
function CodePanel() {
  const k = (s: ReactNode) => <span className="text-sky-300">{s}</span>;
  const str = (s: ReactNode) => <span className="text-emerald-300">{s}</span>;
  const c = (s: ReactNode) => <span className="text-slate-500">{s}</span>;
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-[#070c17]">
      <div className="flex items-center gap-4 border-b border-white/10 px-4 text-[12px]">
        <span className="-mb-px border-b border-emerald-400 py-2.5 text-slate-200">payout-run.ts</span>
        <span className="py-2.5 text-slate-500">memo.json</span>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-[12px] leading-[1.75] text-slate-300">
        {c("// One payout run is one transaction from the payer's wallet")}
        {"\n"}
        {k("Multicall3From")}.aggregate3([{"\n"}
        {"  "}{k("Memo")}.memo(USDC, transfer(payer, {str("0")}),     {c("/* run anchor */")}),{"\n"}
        {"  "}{k("Memo")}.memo(USDC, transfer(S01, {str("0.184")}), {str('"…-S01"')}),{"\n"}
        {"  "}{k("Memo")}.memo(USDC, transfer(S02, {str("0.097")}), {str('"…-S02"')}),{"\n"}
        {"  "}{c("…")}{"\n"}
        ]){"\n"}
        {"\n"}
        {c("// The memo each transfer carries (ISO 20022 field names)")}
        {"\n"}
        tp1:{"{"}{"\n"}
        {"  "}{str('"EndToEndId"')}: {str('"PB-202610-I7JR-S01"')},{"\n"}
        {"  "}{str('"PmtInfId"')}:   {str('"PB-202610-I7JR"')},{"\n"}
        {"  "}{str('"Purp"')}:       {str('"COMM"')},{"\n"}
        {"  "}{str('"CdtrRef"')}:    {str('"STMT-202610-S01"')}{"\n"}
        {"}"}
      </pre>
    </div>
  );
}

export default function Overview() {
  return (
    <div className="space-y-24 pb-6 sm:space-y-28">
      {/* Hero */}
      <section className="grid items-center gap-14 pt-6 lg:grid-cols-[0.92fr_1.08fr] lg:gap-12 lg:pt-14">
        <div className="min-w-0">
          <ExternalLink
            href={`https://explorer.arc.io/tx/${MAINNET_BATCH}`}
            className="rise inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pr-3 pl-1 text-[12.5px] text-slate-600 no-underline hover:border-slate-300 hover:no-underline"
          >
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11.5px] font-medium text-emerald-700">Live</span>
            Running on Arc mainnet
            <span className="text-slate-400">→</span>
          </ExternalLink>
          <h1 className="rise mt-6 text-[44px] leading-[1.02] font-semibold tracking-[-0.045em] text-balance text-ink sm:text-[62px]" style={stagger(1)}>
            Check every USDC payment on Arc against your books.
          </h1>
          <p className="rise mt-6 max-w-[30rem] text-[17px] leading-relaxed text-slate-600 text-pretty" style={stagger(2)}>
            Load your payout or invoice ledger and a wallet address. Tieout shows which transfers match, which don't, and gives you journal entries
            to import.
          </p>
          <div className="rise mt-9 flex flex-wrap items-center gap-3" style={stagger(3)}>
            <button className="btn-primary h-11 px-5 text-[14px]" onClick={() => navigate("console", "demo")}>
              Try the mainnet demo
              <span aria-hidden>→</span>
            </button>
            <button className="btn-secondary h-11 px-5 text-[14px]" onClick={() => navigate("pay")}>Pay or request</button>
          </div>
          <div className="rise mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-slate-500" style={stagger(4)}>
            {["Runs in your browser", "No server, no keys", "Open source"].map((t) => (
              <span key={t} className="inline-flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-emerald-600" />
                {t}
              </span>
            ))}
          </div>
        </div>
        <HeroVisual />
      </section>

      {/* Figures */}
      <section className="grid gap-10 border-t border-slate-200 pt-12 sm:grid-cols-3 sm:gap-8">
        {FIGURES.map((f) => (
          <div key={f.n}>
            <div className="nums text-[44px] leading-none font-semibold tracking-[-0.045em] text-ink">{f.n}</div>
            <p className="mt-4 max-w-[19rem] text-[14.5px] leading-relaxed text-slate-600">{f.body}</p>
            <ExternalLink href={f.href} className="mt-2.5 inline-block text-[12.5px] text-slate-500">{f.src}</ExternalLink>
          </div>
        ))}
      </section>

      {/* How it works, on ink */}
      <section className="overflow-hidden rounded-2xl bg-ink text-white">
        <div className="grid gap-12 p-7 sm:p-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14 lg:p-14">
          <div>
            <p className="text-[13px] font-medium text-emerald-400">How it works</p>
            <h2 className="mt-3 text-[30px] leading-[1.1] font-semibold tracking-[-0.035em] text-balance sm:text-[36px]">
              Built on contracts Arc already ships.
            </h2>
            <ol className="mt-10 space-y-7">
              {STEPS.map((s, i) => (
                <li key={s.title} className="grid grid-cols-[2.25rem_1fr] gap-3">
                  <span className="nums flex h-7 w-7 items-center justify-center rounded-full border border-white/15 font-mono text-[12px] text-slate-300">{i + 1}</span>
                  <div>
                    <h3 className="text-[16px] font-semibold tracking-[-0.01em]">{s.title}</h3>
                    <p className="mt-1.5 text-[14.5px] leading-relaxed text-slate-400">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div className="min-w-0 lg:pt-2">
            <CodePanel />
            <p className="mt-4 text-[13px] leading-relaxed text-slate-400">
              Arc's predeployed <span className="font-mono text-[12.5px] text-slate-200">Memo</span> and{" "}
              <span className="font-mono text-[12.5px] text-slate-200">Multicall3From</span>. No contracts of our own to audit or trust.
            </p>
          </div>
        </div>
      </section>

      {/* Outcomes */}
      <section>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-[28px] leading-[1.15] font-semibold tracking-[-0.035em] text-ink">Seven possible results</h2>
            <p className="mt-2 max-w-lg text-[15px] leading-relaxed text-slate-600">
              Every ledger line and every transfer ends up in exactly one. These are the counts from the mainnet demo.
            </p>
          </div>
          <button className="text-[13.5px] font-medium text-slate-700 underline decoration-slate-300 underline-offset-4 hover:decoration-slate-600" onClick={() => navigate("console", "demo")}>
            Open this run →
          </button>
        </div>
        <div className="mt-7 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 sm:grid-cols-4 lg:grid-cols-7">
          {OUTCOMES.map(([st, n]) => (
            <div key={st} className="bg-white p-4">
              <StatusBadge status={st} />
              <div className={`nums mt-4 text-[30px] leading-none font-semibold tracking-[-0.04em] ${n ? "text-ink" : "text-slate-300"}`}>{n}</div>
            </div>
          ))}
          <div className="bg-white p-4 lg:hidden" aria-hidden />
        </div>
      </section>

      {/* Closing */}
      <section className="flex flex-col items-start justify-between gap-6 rounded-2xl border border-slate-200 bg-white p-7 sm:flex-row sm:items-center sm:p-9">
        <div>
          <h2 className="text-[22px] font-semibold tracking-[-0.03em] text-ink">See it on real transactions.</h2>
          <p className="mt-1.5 text-[14.5px] text-slate-600">The demo reconciles a fictional marketplace's payouts, sent on Arc mainnet.</p>
        </div>
        <div className="flex shrink-0 gap-3">
          <button className="btn-primary h-10 px-4" onClick={() => navigate("console", "demo")}>Run the demo</button>
          <ExternalLink href={REPO_URL} className="btn-secondary h-10 px-4 no-underline hover:no-underline">View source</ExternalLink>
        </div>
      </section>
    </div>
  );
}
