import type { CSSProperties, ReactNode } from "react";
import { navigate } from "../App.tsx";
import { ExternalLink, StatusBadge } from "../components/ui.tsx";
import type { ReconStatus } from "@tieout/recon";

const MAINNET_BATCH = "0x252dd1ff0f0ad77cb2d9fde109cd96de409521d52fbd662e4a9907eed684379e";

const I = {
  tag: <path d="M3.5 8V4.5A1 1 0 014.5 3.5H8l8.5 8.5-4.5 4.5L3.5 8zM6.75 6.75h.01" />,
  anchor: <path d="M10 5v11M5.5 12l4.5 4 4.5-4M10 5a1.75 1.75 0 100-3.5A1.75 1.75 0 0010 5z" />,
  tie: <path d="M3 10h14M6.5 6.5L10 10l-3.5 3.5M13.5 6.5L10 10l3.5 3.5" />,
  search: <path d="M9 14.5a5.5 5.5 0 100-11 5.5 5.5 0 000 11zM16.5 16.5L13 13" />,
  book: <path d="M4.5 4.5h7.5a3 3 0 013 3V16H7.5a3 3 0 00-3 3V4.5zM4.5 4.5V19" />,
  memo: <path d="M5 3.5h10v13H5zM7.5 7h5M7.5 10h5M7.5 13h3" />,
  batch: <path d="M4 5h12M4 10h12M4 15h12M7 3v4M13 8v4M9 13v4" />,
  gas: <path d="M5 4h7v12H5zM12 8h2l2 2v4a1.5 1.5 0 01-3 0V8M7 7h3" />,
  log: <path d="M3 15l4-6 3 4 3-8 4 10" />,
};

function Glyph({ d }: { d: ReactNode }) {
  return (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {d}
    </svg>
  );
}

const STEPS = [
  { icon: I.tag, title: "Tag", body: "ISO 20022 memo on every payment, through Arc's native Memo contract." },
  { icon: I.anchor, title: "Anchor", body: "One transaction per run; the ledger hash goes first, so later edits show." },
  { icon: I.tie, title: "Reconcile", body: "Both directions, three grades of evidence. Ambiguity is held, never guessed." },
  { icon: I.search, title: "Verify", body: "Find any payment from its EndToEndId alone, bound by callDataHash." },
  { icon: I.book, title: "Book", body: "Balanced entries, roll-forward to the wei, Xero, QuickBooks, camt.054." },
];

const PRIMITIVES = [
  { icon: I.memo, name: "Memo", why: "References live in the transaction, indexed by memoId." },
  { icon: I.batch, name: "Multicall3From", why: "Batches keep the payer as msg.sender." },
  { icon: I.gas, name: "USDC as gas", why: "Fees are a plain USD expense." },
  { icon: I.log, name: "EIP-7708 logs", why: "Even a plain wallet send leaves a trace." },
];

const STATUSES: Array<[ReconStatus, string]> = [
  ["matched", "Memo or reference agrees with the ledger."],
  ["matched_by_intent", "No memo; counterparty and amount match one entry."],
  ["mismatch", "Points to an entry, details differ. Short or over by how much."],
  ["ambiguous", "More than one way to pair. Held for a person."],
  ["missing", "Expected, never happened."],
  ["duplicate", "Settled twice."],
  ["unexpected", "Moved with no entry, either direction."],
];

const stagger = (i: number) => ({ "--i": i } as CSSProperties);

/** A scaled-down, real Reconcile result: run PB-202610-I7JR on Arc mainnet. */
function ProductPreview() {
  const rows: Array<[ReconStatus, string, string, string]> = [
    ["matched", "PB-202610-I7JR-S01", "memo", "0.184"],
    ["matched", "PB-202610-I7JR-S11", "reference", "0.120"],
    ["matched_by_intent", "PB-202610-I7JR-S07", "intent", "0.078"],
    ["mismatch", "PB-202610-I7JR-S04", "over-paid 0.015", "0.150"],
    ["missing", "PB-202610-I7JR-S12", "not paid", "—"],
    ["unexpected", "0xd0a300…c518", "native send", "0.010"],
  ];
  return (
    <div className="window rise" style={stagger(2)}>
      <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/80 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
        <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
        <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
        <span className="ml-3 text-[11px] font-medium text-slate-500">Reconciliation · Arc mainnet · 0x2ccb42…e841</span>
      </div>
      <div className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100">
        {[
          ["Settled", "1.345", "text-emerald-700"],
          ["Exceptions", "5", "text-rose-700"],
          ["Balance", "ties ✓", "text-emerald-700"],
        ].map(([k, v, c]) => (
          <div key={k} className="px-4 py-3">
            <div className="text-[10px] font-semibold tracking-[0.12em] text-slate-500 uppercase">{k}</div>
            <div className={`nums mt-0.5 text-lg font-semibold tracking-tight ${c}`}>{v}</div>
          </div>
        ))}
      </div>
      <ul className="divide-y divide-slate-100">
        {rows.map(([status, id, note, amt]) => (
          <li key={id} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-2.5 text-xs">
            <StatusBadge status={status} />
            <div className="min-w-0">
              <div className="truncate font-mono text-slate-800">{id}</div>
              <div className="text-[11px] text-slate-500">{note}</div>
            </div>
            <div className="nums font-mono text-slate-800">{amt}</div>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/60 px-4 py-2 text-[11px] text-slate-500">
        <span>opening 4.912582 + in 0.06 − out 1.49 − fees 0.018344</span>
        <span className="font-medium text-emerald-700">= 3.464238 on-chain</span>
      </div>
    </div>
  );
}

export default function Overview() {
  return (
    <div className="space-y-20">
      {/* Hero */}
      <section className="relative -mx-4 px-4 pt-4 sm:-mx-6 sm:px-6">
        <div className="hero-glow absolute inset-x-0 -top-10 h-[34rem] rounded-b-[3rem]" aria-hidden />
        <div className="dot-grid absolute inset-x-0 -top-10 h-[34rem]" aria-hidden />
        <div className="relative grid items-center gap-10 py-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14 lg:py-12">
          <div>
            <div className="rise flex flex-wrap items-center gap-2" style={stagger(0)}>
              <p className="eyebrow">Reconciliation layer for Arc</p>
              <ExternalLink href={`https://explorer.arc.io/tx/${MAINNET_BATCH}`} className="chip no-underline hover:no-underline">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
                Live on Arc mainnet
              </ExternalLink>
            </div>
            <h1 className="rise mt-5 text-[40px] leading-[1.05] font-semibold tracking-[-0.03em] text-balance text-slate-900 sm:text-[58px]" style={stagger(1)}>
              USDC settles in under a second. <span className="text-ink-gradient">Your books should keep up.</span>
            </h1>
            <p className="rise mt-6 max-w-xl text-[17px] leading-relaxed text-slate-600 text-pretty" style={stagger(2)}>
              Tieout ties every USDC payment and receipt on Arc to the ledger entry it settles, flags what doesn't match, and hands your accountant balanced entries.
            </p>
            <div className="rise mt-8 flex flex-wrap gap-3" style={stagger(3)}>
              <button className="btn-primary" onClick={() => navigate("console", "demo")}>Run the mainnet demo</button>
              <button className="btn-secondary" onClick={() => navigate("verify")}>Verify a payment</button>
              <button className="btn-secondary" onClick={() => navigate("pay")}>Pay or request</button>
            </div>
            <p className="rise mt-5 text-xs text-slate-500" style={stagger(4)}>Runs in your browser against a public Arc RPC. No backend, no keys, no custom contracts.</p>
          </div>
          <ProductPreview />
        </div>
      </section>

      {/* Proof points as one band */}
      <section className="card grid divide-y divide-slate-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {[
          ["70%", "of 350 corporates and FIs would adopt stablecoins sooner with ERP integration.", "EY-Parthenon, 2025", "https://www.ey.com/en_us/insights/financial-services/cost-savings-and-speed-drive-stablecoin-adoption"],
          ["$226B", "of real stablecoin payments in 2025 were B2B, money that lands in someone's books.", "McKinsey × Artemis", "https://www.mckinsey.com/industries/financial-services/our-insights/stablecoins-in-payments-what-the-raw-transaction-numbers-miss"],
          ["0.88×", "the cost of a plain transfer for a memo-tagged payment in a batch, measured on mainnet.", "This repository", `https://explorer.arc.io/tx/${MAINNET_BATCH}`],
        ].map(([n, body, src, href]) => (
          <div key={n} className="p-6">
            <div className="nums text-[34px] leading-none font-semibold tracking-tight text-slate-900">{n}</div>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">{body}</p>
            <ExternalLink href={href!} className="mt-2 inline-block text-xs text-slate-500">{src}</ExternalLink>
          </div>
        ))}
      </section>

      {/* Steps with a connector */}
      <section>
        <p className="eyebrow">How it works</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight">Five steps, one transaction per run</h2>
        <ol className="relative mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="absolute top-10 right-16 left-16 hidden h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent lg:block" aria-hidden />
          {STEPS.map((s, i) => (
            <li key={s.title} className="card card-lift relative p-5">
              <div className="flex items-center justify-between">
                <span className="tile"><Glyph d={s.icon} /></span>
                <span className="nums rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">0{i + 1}</span>
              </div>
              <h3 className="mt-4 font-semibold">{s.title}</h3>
              <p className="mt-1 text-[13.5px] leading-relaxed text-slate-600">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Outcomes + Arc */}
      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="card p-6 sm:p-7">
          <p className="eyebrow">Outcomes</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">Seven outcomes, nothing silent</h2>
          <ul className="mt-5 divide-y divide-slate-100">
            {STATUSES.map(([status, body]) => (
              <li key={status} className="flex flex-col gap-1 py-2.5 text-sm sm:flex-row sm:items-center sm:gap-4">
                <div className="shrink-0 sm:w-40"><StatusBadge status={status} /></div>
                <div className="text-slate-600">{body}</div>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-4">
          <div className="card p-6 sm:p-7">
            <p className="eyebrow">Built on Arc</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">Arc's own primitives, nothing added</h2>
            <ul className="mt-5 grid gap-4 sm:grid-cols-2">
              {PRIMITIVES.map((p) => (
                <li key={p.name} className="flex gap-3">
                  <span className="tile shrink-0"><Glyph d={p.icon} /></span>
                  <div>
                    <div className="font-semibold">{p.name}</div>
                    <div className="mt-0.5 text-[13px] leading-relaxed text-slate-600">{p.why}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="card p-6 text-sm leading-relaxed text-slate-600 sm:p-7">
            <span className="font-semibold text-slate-800">Any payer.</span> EOA, Safe, custodian or plain send; payouts out and invoices in. References published afterwards give memo-less payments the same evidence as a memo.
          </div>
        </div>
      </section>

      {/* Closing */}
      <section className="relative overflow-hidden rounded-3xl bg-ink px-6 py-10 text-white sm:px-10 sm:py-12">
        <div className="absolute inset-0 opacity-70" style={{ background: "radial-gradient(40rem 20rem at 80% 0%, rgba(52,211,153,0.25), transparent 60%)" }} aria-hidden />
        <div className="relative flex flex-col items-start gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Others prove the money moved. Tieout proves the books are right.</h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/70">Open source, Apache-2.0. A memo convention for the whole chain, an SDK to compose with, an audit bundle anyone can re-run.</p>
          </div>
          <div className="flex shrink-0 gap-3">
            <button className="inline-flex items-center justify-center rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-emerald-300" onClick={() => navigate("console", "demo")}>Run the demo</button>
            <ExternalLink href="https://github.com/ZhenYan1214/TallyPay" className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white no-underline transition hover:bg-white/10 hover:no-underline">Source</ExternalLink>
          </div>
        </div>
      </section>
    </div>
  );
}
