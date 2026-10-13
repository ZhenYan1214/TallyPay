import type { CSSProperties } from "react";
import { navigate, REPO_URL } from "../App.tsx";
import { ExternalLink, StatusBadge } from "../components/ui.tsx";
import type { ReconStatus } from "@tieout/recon";

const MAINNET_BATCH = "0x252dd1ff0f0ad77cb2d9fde109cd96de409521d52fbd662e4a9907eed684379e";

const STEPS = [
  { title: "Pay", body: "Send a batch from your own wallet. Each transfer carries a memo with its payout or invoice ID." },
  {
    title: "Reconcile",
    body: "Tieout reads the wallet on Arc and matches every transfer to a line in your ledger. Payments sent without a memo are matched on amount and recipient, but only when there is exactly one candidate.",
  },
  { title: "Export", body: "Download journal entries for Xero or QuickBooks, a camt.054 file for a treasury system, or an audit file anyone can re-run." },
];

const STATUSES: ReconStatus[] = ["matched", "matched_by_intent", "mismatch", "ambiguous", "missing", "duplicate", "unexpected"];

const FIGURES: Array<{ n: string; body: string; src: string; href: string }> = [
  {
    n: "70%",
    body: "of companies surveyed say ERP integration would speed up their stablecoin adoption.",
    src: "EY-Parthenon",
    href: "https://www.ey.com/en_us/insights/financial-services/cost-savings-and-speed-drive-stablecoin-adoption",
  },
  {
    n: "$226B",
    body: "in B2B stablecoin payments in 2025.",
    src: "McKinsey, Artemis",
    href: "https://www.mckinsey.com/industries/financial-services/our-insights/stablecoins-in-payments-what-the-raw-transaction-numbers-miss",
  },
  {
    n: "0.88×",
    body: "the gas of a plain transfer, for a payment with a memo in a batch.",
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

/** Six rows of a real result: run PB-202610-I7JR on Arc mainnet. */
function Preview() {
  return (
    <figure className="rise min-w-0" style={stagger(2)}>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[var(--shadow-lift)]">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div className="min-w-0">
            <div className="text-[13.5px] font-semibold text-slate-900">Reconciliation</div>
            <div className="truncate font-mono text-[11.5px] text-slate-500">PB-202610-I7JR · 0x2ccb42…e841</div>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 text-[12px] text-slate-500">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
            Arc mainnet
          </span>
        </div>

        <dl className="grid grid-cols-3 border-b border-slate-200">
          {[
            ["Settled", "1.345", "text-slate-900"],
            ["Exceptions", "5", "text-rose-700"],
            ["Unexplained", "0", "text-emerald-700"],
          ].map(([k, v, c], i) => (
            <div key={k} className={`px-4 py-3 ${i ? "border-l border-slate-200" : ""}`}>
              <dt className="text-[12px] text-slate-500">{k}</dt>
              <dd className={`nums mt-0.5 text-[18px] font-semibold tracking-[-0.02em] ${c}`}>{v}</dd>
            </div>
          ))}
        </dl>

        <table className="w-full table-fixed text-[13px]">
          <colgroup>
            <col className="w-[8.25rem] sm:w-[9.5rem]" />
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
                <td className={`nums py-2.5 pr-4 text-right font-mono text-[12.5px] ${r.status === "mismatch" || r.status === "unexpected" ? "text-rose-700" : "text-slate-800"}`}>
                  {r.amount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-slate-200 bg-slate-50/70 px-4 py-2.5 font-mono text-[11.5px] text-slate-500">
          <span>4.912582 + 0.06 − 1.49 − 0.018344</span>
          <span className="text-emerald-700">= 3.464238 on-chain ✓</span>
        </div>
      </div>
      <figcaption className="mt-2.5 text-[12.5px] text-slate-500">
        Six rows from a real run on Arc mainnet.{" "}
        <ExternalLink href={`https://explorer.arc.io/tx/${MAINNET_BATCH}`}>View on Arcscan</ExternalLink>
      </figcaption>
    </figure>
  );
}

export default function Overview() {
  return (
    <div className="space-y-20 pb-4 sm:space-y-24">
      {/* Hero */}
      <section className="grid items-center gap-12 pt-4 lg:grid-cols-[1fr_1fr] lg:gap-14 lg:pt-10">
        <div className="min-w-0">
          <ExternalLink
            href={`https://explorer.arc.io/tx/${MAINNET_BATCH}`}
            className="rise inline-flex items-center gap-2 text-[13px] text-slate-600 no-underline hover:no-underline"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
            Live on Arc mainnet
            <span className="text-slate-400">→</span>
          </ExternalLink>
          <h1 className="rise mt-5 text-[42px] leading-[1.04] font-semibold tracking-[-0.04em] text-balance text-ink sm:text-[56px]" style={stagger(1)}>
            Check every USDC payment on Arc against your books.
          </h1>
          <p className="rise mt-6 max-w-[31rem] text-[17px] leading-relaxed text-slate-600 text-pretty" style={stagger(2)}>
            Load your payout or invoice ledger and a wallet address. Tieout shows which transfers match, which don't, and gives you journal entries
            to import.
          </p>
          <div className="rise mt-8 flex flex-wrap gap-2.5" style={stagger(3)}>
            <button className="btn-primary h-10 px-4" onClick={() => navigate("console", "demo")}>Try the mainnet demo</button>
            <button className="btn-secondary h-10 px-4" onClick={() => navigate("pay")}>Pay or request</button>
          </div>
          <p className="rise mt-5 text-[13px] text-slate-500" style={stagger(4)}>Runs in your browser. No server, no keys.</p>
        </div>
        <Preview />
      </section>

      {/* Figures */}
      <section className="grid overflow-hidden rounded-xl border border-slate-200 bg-white sm:grid-cols-3">
        {FIGURES.map((f, i) => (
          <div key={f.n} className={`p-6 ${i ? "border-t border-slate-200 sm:border-t-0 sm:border-l" : ""}`}>
            <div className="nums text-[32px] leading-none font-semibold tracking-[-0.03em] text-ink">{f.n}</div>
            <p className="mt-3 text-[14px] leading-relaxed text-slate-600">{f.body}</p>
            <ExternalLink href={f.href} className="mt-2 inline-block text-[12.5px] text-slate-500">{f.src}</ExternalLink>
          </div>
        ))}
      </section>

      {/* How it works */}
      <section>
        <h2 className="text-[24px] font-semibold tracking-[-0.03em] text-ink">How it works</h2>
        <ol className="mt-6 grid gap-8 sm:grid-cols-3 sm:gap-6">
          {STEPS.map((s, i) => (
            <li key={s.title} className="border-t border-slate-300 pt-4">
              <div className="flex items-baseline gap-3">
                <span className="nums font-mono text-[12px] text-slate-400">0{i + 1}</span>
                <h3 className="text-[16px] font-semibold tracking-[-0.01em] text-slate-900">{s.title}</h3>
              </div>
              <p className="mt-2 text-[14.5px] leading-relaxed text-slate-600">{s.body}</p>
            </li>
          ))}
        </ol>

        <div className="mt-12 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-6">
          <span className="mr-1 text-[14px] text-slate-600">Every line ends up as one of</span>
          {STATUSES.map((st) => <StatusBadge key={st} status={st} />)}
        </div>
        <p className="mt-4 text-[14px] leading-relaxed text-slate-500">
          Built only on contracts Arc already ships, <span className="font-mono text-[12.5px] text-slate-700">Memo</span> and{" "}
          <span className="font-mono text-[12.5px] text-slate-700">Multicall3From</span>. Open source under{" "}
          <ExternalLink href={REPO_URL}>Apache-2.0</ExternalLink>.
        </p>
      </section>
    </div>
  );
}
