import type { CSSProperties, ReactNode } from "react";
import { navigate, REPO_URL } from "../App.tsx";
import { ExternalLink, StatusBadge, Tick } from "../components/ui.tsx";
import type { ReconStatus } from "@tieout/recon";

const MAINNET_BATCH = "0x252dd1ff0f0ad77cb2d9fde109cd96de409521d52fbd662e4a9907eed684379e";

const STEPS = [
  { title: "Pay", body: "Send a batch from your own wallet. Each transfer carries a memo with its payout or invoice ID." },
  { title: "Reconcile", body: "Tieout reads the wallet on Arc and matches every transfer to a line in your ledger. Payments sent without a memo are matched on amount and recipient, but only when there is exactly one candidate." },
  { title: "Export", body: "Download journal entries for Xero or QuickBooks, a camt.054 file for a treasury system, or an audit file anyone can re-run." },
];

const STATUSES: ReconStatus[] = ["matched", "matched_by_intent", "mismatch", "ambiguous", "missing", "duplicate", "unexpected"];

const FIGURES: Array<{ n: string; body: string; src: string; href: string }> = [
  {
    n: "70%",
    body: "of companies surveyed say ERP integration would speed up their stablecoin adoption",
    src: "EY-Parthenon",
    href: "https://www.ey.com/en_us/insights/financial-services/cost-savings-and-speed-drive-stablecoin-adoption",
  },
  {
    n: "$226B",
    body: "in B2B stablecoin payments in 2025",
    src: "McKinsey, Artemis",
    href: "https://www.mckinsey.com/industries/financial-services/our-insights/stablecoins-in-payments-what-the-raw-transaction-numbers-miss",
  },
  {
    n: "0.88×",
    body: "the gas of a plain transfer, for a payment with a memo in a batch",
    src: "measured on Arc mainnet",
    href: `https://explorer.arc.io/tx/${MAINNET_BATCH}`,
  },
];

const stagger = (i: number) => ({ "--i": i } as CSSProperties);

type Mark = "tick" | "intent" | "flag" | "open";

function RowMark({ mark }: { mark: Mark }) {
  if (mark === "tick") return <Tick className="h-3.5 w-3.5 text-emerald-600" />;
  if (mark === "intent") return <Tick className="h-3.5 w-3.5 text-sky-600" />;
  if (mark === "flag") return <span className="font-mono text-[13px] leading-none font-semibold text-rose-600">✕</span>;
  return <span className="font-mono text-[13px] leading-none text-slate-400">○</span>;
}

/** A real result, printed: run PB-202610-I7JR on Arc mainnet. */
function TieOutSheet() {
  const rows: Array<{ mark: Mark; id: string; who?: string; how: ReactNode; amount: string; tone?: string }> = [
    { mark: "tick", id: "S01", who: "Aiko Tanaka", how: "memo", amount: "0.184000" },
    { mark: "tick", id: "S11", who: "Grace Mensah", how: "reference", amount: "0.120000" },
    { mark: "intent", id: "S07", who: "Minh Nguyen", how: "intent, no memo", amount: "0.078000" },
    { mark: "flag", id: "S04", who: "Priya Raman", how: <span className="text-rose-700">over-paid 0.015</span>, amount: "0.150000", tone: "text-rose-700" },
    { mark: "open", id: "S12", who: "Daniel Kim", how: "not paid", amount: "—", tone: "text-slate-400" },
    { mark: "flag", id: "in", how: <span className="text-rose-700">native send, no entry</span>, amount: "0.010000", tone: "text-rose-700" },
  ];
  const roll: Array<[string, string, string?]> = [
    ["Opening balance", "4.912582"],
    ["Add receipts", "0.060000"],
    ["Less payments", "(1.490000)"],
    ["Less network fees", "(0.018344)"],
  ];
  return (
    <figure className="rise relative min-w-0" style={stagger(2)}>
      <div className="ruled relative overflow-hidden rounded-[4px] border border-slate-300 pl-[54px] sm:pl-[60px] shadow-[0_1px_0_rgba(31,26,21,0.05),0_24px_48px_-32px_rgba(31,26,21,0.45)]">
        <div className="pt-5 pr-5 pb-3">
          <div className="flex items-baseline justify-between gap-3">
            <div className="display text-[22px] leading-none">Tie-out schedule</div>
            <div className="font-mono text-[10px] tracking-[0.12em] text-slate-500 uppercase">Arc mainnet</div>
          </div>
          <div className="mt-1.5 font-mono text-[10.5px] text-slate-500">Run PB-202610-I7JR · payer 0x2ccb42…e841</div>
        </div>

        <table className="w-full table-fixed text-[12.5px]">
          <thead>
            <tr className="table-head text-left">
              <th className="w-6 py-1.5 font-semibold" aria-label="Mark" />
              <th className="w-12 py-1.5 font-semibold">Entry</th>
              <th className="py-1.5 font-semibold">Settled by</th>
              <th className="w-[5.6rem] py-1.5 pr-5 text-right font-semibold">USDC</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id + r.amount} className="h-8 border-b border-transparent">
                <td className="align-middle"><RowMark mark={r.mark} /></td>
                <td className="font-mono text-[11.5px] text-slate-600">{r.id}</td>
                <td className="truncate text-slate-700">
                  {r.who && <span className="hidden sm:inline">{r.who} · </span>}
                  {r.how}
                </td>
                <td className={`nums pr-5 text-right font-mono ${r.tone ?? "text-slate-900"}`}>{r.amount}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-3 border-t border-slate-800 pt-2 pr-5 pb-[92px] text-[12.5px]">
          <div className="mb-1 font-mono text-[10px] tracking-[0.12em] text-slate-500 uppercase">Balance roll-forward</div>
          {roll.map(([k, v]) => (
            <div key={k} className="flex h-6 items-center justify-between text-slate-700">
              <span>{k}</span>
              <span className="nums font-mono">{v}</span>
            </div>
          ))}
          <div className="flex h-7 items-center justify-between font-semibold text-ink">
            <span>Closing, per ledger</span>
            <span className="nums total font-mono">3.464238</span>
          </div>
          <div className="flex h-6 items-center justify-between text-slate-600">
            <span>Closing, on-chain</span>
            <span className="nums inline-flex items-center gap-1.5 font-mono text-emerald-700">
              <Tick className="h-3 w-3" />3.464238
            </span>
          </div>
        </div>

        <div className="stamp-in pointer-events-none absolute right-7 bottom-[18px] rounded-[4px] border-[2.5px] border-emerald-600/80 px-3 py-1.5 text-center font-mono text-emerald-700/85 uppercase mix-blend-multiply" aria-hidden>
          <div className="text-[19px] leading-none font-semibold tracking-[0.14em]">Tied out</div>
          <div className="mt-1 text-[8.5px] tracking-[0.18em]">0 unexplained · 13 Oct 2026</div>
        </div>
      </div>
      <figcaption className="mt-2.5 font-mono text-[10.5px] text-slate-500">
        Six rows from a real run on Arc mainnet.{" "}
        <ExternalLink href={`https://explorer.arc.io/tx/${MAINNET_BATCH}`}>View on Arcscan ↗</ExternalLink>
      </figcaption>
    </figure>
  );
}

export default function Overview() {
  return (
    <div className="space-y-20 pb-6">
      {/* Hero */}
      <section className="grid items-start gap-12 pt-6 lg:grid-cols-[1.08fr_0.92fr] lg:gap-16 lg:pt-12">
        <div className="min-w-0">
          <div className="rise flex flex-wrap items-center gap-3" style={stagger(0)}>
            <span className="eyebrow">Reconciliation for Arc</span>
            <ExternalLink href={`https://explorer.arc.io/tx/${MAINNET_BATCH}`} className="chip no-underline hover:no-underline">
              <span className="h-1.5 w-1.5 bg-emerald-500" aria-hidden />
              Live on mainnet
            </ExternalLink>
          </div>
          <h1 className="display rise mt-6 text-[50px] leading-[1] text-balance sm:text-[72px]" style={stagger(1)}>
            Check every USDC payment on Arc against <em className="text-emerald-700">your books.</em>
          </h1>
          <p className="rise mt-7 max-w-[32rem] text-[17px] leading-relaxed text-slate-600 text-pretty" style={stagger(2)}>
            Load your payout or invoice ledger and a wallet address. Tieout shows which transfers match, which don't, and gives you journal entries to import.
          </p>
          <div className="rise mt-9 flex flex-wrap gap-3" style={stagger(3)}>
            <button className="btn-primary" onClick={() => navigate("console", "demo")}>Try the mainnet demo →</button>
            <button className="btn-secondary" onClick={() => navigate("pay")}>Pay or request</button>
          </div>
          <p className="rise mt-6 font-mono text-[11px] text-slate-500" style={stagger(4)}>
            Runs in your browser. No server, no keys.
          </p>
        </div>
        <TieOutSheet />
      </section>

      {/* Figures */}
      <section className="grid gap-6 border-y border-slate-800 py-6 sm:grid-cols-3 sm:gap-8">
        {FIGURES.map((f) => (
          <div key={f.n} className="flex items-baseline gap-4 sm:block">
            <div className="display nums shrink-0 text-[40px] leading-none">{f.n}</div>
            <p className="text-[14px] leading-snug text-slate-600 sm:mt-2">
              {f.body}.{" "}
              <ExternalLink href={f.href} className="font-mono text-[11px] whitespace-nowrap text-slate-500">{f.src}</ExternalLink>
            </p>
          </div>
        ))}
      </section>

      {/* How it works */}
      <section className="grid gap-8 lg:grid-cols-[0.7fr_1.3fr]">
        <h2 className="display text-[36px] leading-none">How it works</h2>
        <div>
          <ol className="border-t border-slate-800">
            {STEPS.map((s, i) => (
              <li key={s.title} className="grid grid-cols-[2.5rem_1fr] gap-x-4 border-b border-slate-300 py-5 sm:grid-cols-[3rem_9rem_1fr]">
                <span className="nums pt-1.5 font-mono text-[12px] text-slate-400">{i + 1}</span>
                <h3 className="display text-[26px] leading-none">{s.title}</h3>
                <p className="col-start-2 mt-2 text-[15px] leading-relaxed text-slate-600 sm:col-start-3 sm:mt-0">{s.body}</p>
              </li>
            ))}
          </ol>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <span className="mr-1 text-[14px] text-slate-600">Every line ends up as one of:</span>
            {STATUSES.map((st) => <StatusBadge key={st} status={st} />)}
          </div>
          <p className="mt-6 text-[14px] leading-relaxed text-slate-500">
            Built only on contracts Arc already ships: <span className="font-mono text-[13px] text-slate-700">Memo</span> and{" "}
            <span className="font-mono text-[13px] text-slate-700">Multicall3From</span>. Open source,{" "}
            <ExternalLink href={REPO_URL}>Apache-2.0</ExternalLink>.
          </p>
        </div>
      </section>
    </div>
  );
}
