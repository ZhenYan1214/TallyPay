import type { ReactNode } from "react";
import { navigate } from "../App.tsx";
import { ExternalLink } from "../components/ui.tsx";

const MAINNET_BATCH = "0x252dd1ff0f0ad77cb2d9fde109cd96de409521d52fbd662e4a9907eed684379e";

/* Small inline icon set; kept local so the page has no icon dependency. */
const Icon = {
  tag: <path d="M3 7.5V4a1 1 0 011-1h3.5l9 9-4.5 4.5-9-9z M6.5 6.5h.01" />,
  anchor: <path d="M10 4v12M5 11l5 5 5-5M10 4a2 2 0 100-4 2 2 0 000 4z" />,
  tie: <path d="M3 10h14M6 6l4 4-4 4M14 6l-4 4 4 4" />,
  search: <path d="M9 15a6 6 0 100-12 6 6 0 000 12zM17 17l-3.5-3.5" />,
  book: <path d="M4 4h8a3 3 0 013 3v9H7a3 3 0 00-3 3V4zM4 4v15" />,
};

function Glyph({ d }: { d: ReactNode }) {
  return (
    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {d}
    </svg>
  );
}

const STEPS = [
  { icon: Icon.tag, title: "Tag", body: "ISO 20022 memo on every payment through Arc's native Memo contract." },
  { icon: Icon.anchor, title: "Anchor", body: "One Multicall3From transaction per run, ledger hash anchored first." },
  { icon: Icon.tie, title: "Tie out", body: "Both directions, three grades of evidence. Ambiguity is held, never guessed." },
  { icon: Icon.search, title: "Verify", body: "Find any payment from its EndToEndId alone, bound by callDataHash." },
  { icon: Icon.book, title: "Book", body: "Balanced entries, roll-forward to the wei, Xero, QuickBooks, camt.054." },
];

const EVIDENCE = [
  { grade: "Memo", who: "The payer, when paying", body: "In the transaction, bound to the exact transfer.", tone: "bg-emerald-500" },
  { grade: "Reference", who: "A trusted EOA, afterwards", body: "For Safe, custodial and plain-send payments.", tone: "bg-sky-500" },
  { grade: "Intent", who: "Inferred, only when unique", body: "Counterparty, token and amount; otherwise ambiguous.", tone: "bg-slate-400" },
];

const OUTCOMES: Array<[string, string]> = [
  ["Matched", "bg-emerald-500"],
  ["Matched by intent", "bg-sky-500"],
  ["Mismatch", "bg-amber-500"],
  ["Ambiguous", "bg-violet-500"],
  ["Not paid", "bg-slate-400"],
  ["Duplicate", "bg-rose-500"],
  ["Unexpected", "bg-rose-500"],
];

/** Real numbers from the mainnet run PB-202610-I7JR, styled like a statement. */
function StatementCard() {
  const rows: Array<[string, string, string?]> = [
    ["Expected", "1.590000"],
    ["Settled", "1.345000", "text-emerald-300"],
    ["Exceptions", "0.205000", "text-rose-300"],
    ["Network fees", "0.018344"],
  ];
  return (
    <div className="relative rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-sm sm:p-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] font-semibold tracking-[0.16em] text-white/50 uppercase">Statement · Arc mainnet</div>
          <div className="mt-1 font-mono text-xs text-white/70">0x2ccb42…e841 · PB-202610-I7JR</div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-medium text-emerald-200">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
          Fully explained
        </span>
      </div>
      <dl className="nums mt-5 space-y-2.5 text-sm">
        {rows.map(([k, v, tone]) => (
          <div key={k} className="leader">
            <dt className="text-white/70">{k}</dt>
            <span className="leader-dots border-white/15" />
            <dd className={`font-mono ${tone ?? "text-white"}`}>{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-5 grid grid-cols-7 gap-1.5">
        {[
          ["bg-emerald-400", 10],
          ["bg-sky-400", 1],
          ["bg-amber-400", 1],
          ["bg-slate-400", 2],
          ["bg-rose-400", 2],
        ].flatMap(([c, n]) => Array.from({ length: n as number }, (_, i) => <span key={`${c}-${i}`} className={`h-1.5 rounded-full ${c as string}`} />))}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-white/50">
        <span>10 matched · 1 by intent · 1 mismatch</span>
        <span>2 not paid · 2 unexpected</span>
      </div>
      <div className="mt-5 border-t border-white/10 pt-4 font-mono text-[11px] leading-relaxed text-white/55">
        opening 4.912582 + in 0.060000 − out 1.490000 − fees 0.018344 = 3.464238
        <br />
        on-chain 3.464238 · unexplained 0
      </div>
    </div>
  );
}

export default function Overview() {
  return (
    <div className="space-y-14 sm:space-y-20">
      {/* Hero */}
      <section className="ink-panel">
        <div className="ink-grid absolute inset-0" aria-hidden />
        <div className="relative grid items-center gap-10 px-6 py-12 sm:px-10 sm:py-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold tracking-[0.16em] text-emerald-300 uppercase">Reconciliation layer for Arc</span>
              <ExternalLink
                href={`https://explorer.arc.io/tx/${MAINNET_BATCH}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/80 no-underline hover:bg-white/10 hover:text-white hover:no-underline"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
                Live on mainnet
              </ExternalLink>
            </div>
            <h1 className="display mt-5 text-[44px] leading-[1.02] text-balance sm:text-[64px]">
              USDC settles in a second.
              <br />
              <span className="text-emerald-300">Your books should too.</span>
            </h1>
            <p className="mt-6 max-w-lg text-[17px] leading-relaxed text-white/70">
              Tieout ties every USDC payment and receipt on Arc to the ledger entry it settles, holds what it cannot prove, and hands your accountant balanced entries.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button className="btn-mint" onClick={() => navigate("console", "demo")}>Run the mainnet demo</button>
              <button className="btn-outline-light" onClick={() => navigate("verify")}>Verify a payment</button>
            </div>
            <p className="mt-5 text-xs text-white/45">No backend. No keys. No custom contracts. Runs in your browser against a public Arc RPC.</p>
          </div>
          <StatementCard />
        </div>
      </section>

      {/* Proof points */}
      <section className="grid gap-4 sm:grid-cols-3">
        {[
          ["70%", "of 350 corporates and FIs would adopt stablecoins sooner with ERP integration.", "EY-Parthenon, 2025", "https://www.ey.com/en_us/insights/financial-services/cost-savings-and-speed-drive-stablecoin-adoption"],
          ["$226B", "of real stablecoin payments in 2025 were B2B: money that has to land in someone's books.", "McKinsey × Artemis", "https://www.mckinsey.com/industries/financial-services/our-insights/stablecoins-in-payments-what-the-raw-transaction-numbers-miss"],
          ["0.88×", "the cost of a plain transfer for a memo-tagged payment inside a batch, measured on mainnet.", "This repository", `https://explorer.arc.io/tx/${MAINNET_BATCH}`],
        ].map(([n, body, src, href]) => (
          <div key={n} className="card p-6">
            <div className="display nums text-[40px] leading-none text-slate-900">{n}</div>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">{body}</p>
            <ExternalLink href={href!} className="mt-3 inline-block text-xs text-slate-500">{src}</ExternalLink>
          </div>
        ))}
      </section>

      {/* Steps */}
      <section>
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="eyebrow">How it works</p>
            <h2 className="display mt-1 text-3xl text-slate-900 sm:text-4xl">Five steps. One transaction per run.</h2>
          </div>
        </div>
        <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {STEPS.map((s, i) => (
            <li key={s.title} className="card relative p-5">
              <div className="flex items-center justify-between">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-ink text-emerald-300"><Glyph d={s.icon} /></span>
                <span className="nums text-xs text-slate-400">0{i + 1}</span>
              </div>
              <h3 className="mt-4 font-semibold">{s.title}</h3>
              <p className="mt-1 text-[13.5px] leading-relaxed text-slate-600">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Evidence + outcomes */}
      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="card ruled p-6 sm:p-8">
          <p className="eyebrow">Evidence</p>
          <h2 className="display mt-1 text-3xl text-slate-900">Three grades, strongest first.</h2>
          <ul className="mt-6 space-y-4">
            {EVIDENCE.map((e) => (
              <li key={e.grade} className="flex gap-4 bg-white/80 py-1">
                <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${e.tone}`} aria-hidden />
                <div>
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <span className="font-semibold">{e.grade}</span>
                    <span className="text-xs text-slate-500">{e.who}</span>
                  </div>
                  <p className="text-sm leading-relaxed text-slate-600">{e.body}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-6 bg-white/80 text-sm text-slate-600">
            A fourth, <span className="font-semibold text-slate-800">manual</span>, records a person's decision on an ambiguous pairing, still checked field by field.
          </p>
        </div>
        <div className="card p-6 sm:p-8">
          <p className="eyebrow">Outcomes</p>
          <h2 className="display mt-1 text-3xl text-slate-900">Seven buckets. Nothing silent.</h2>
          <div className="mt-6 flex flex-wrap gap-2">
            {OUTCOMES.map(([name, dot]) => (
              <span key={name} className="chip py-1.5 text-[13px]">
                <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden />
                {name}
              </span>
            ))}
          </div>
          <p className="mt-6 text-sm leading-relaxed text-slate-600">
            Every ledger entry and every transfer lands in exactly one. The run anchor names any entry edited after payment; the balance roll-forward ties opening to closing to the wei.
          </p>
          <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
            {[
              ["Both directions", "Payouts and invoices, one engine."],
              ["Any payer", "EOA, Safe, custodian, plain send."],
              ["Arc-native", "Memo, Multicall3From, EIP-7708 logs."],
              ["Exports", "CSV · Xero · QuickBooks · camt.054"],
            ].map(([t, b]) => (
              <div key={t} className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3">
                <div className="font-semibold text-slate-800">{t}</div>
                <div className="mt-0.5 text-xs text-slate-500">{b}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Closing band */}
      <section className="ink-panel">
        <div className="ink-grid absolute inset-0" aria-hidden />
        <div className="relative flex flex-col items-start gap-6 px-6 py-10 sm:px-10 sm:py-12 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="display text-3xl text-white sm:text-4xl">Others prove the money moved.</h2>
            <p className="display mt-1 text-3xl text-emerald-300 sm:text-4xl">Tieout proves the books are right.</p>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/65">
              Open source, Apache-2.0. A memo convention proposed for the whole chain, an SDK anyone can compose with, and an audit bundle anyone can re-run.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button className="btn-mint" onClick={() => navigate("pay")}>Pay or request</button>
            <ExternalLink href="https://github.com/ZhenYan1214/TallyPay" className="btn-outline-light no-underline hover:no-underline">Read the source</ExternalLink>
          </div>
        </div>
      </section>
    </div>
  );
}
