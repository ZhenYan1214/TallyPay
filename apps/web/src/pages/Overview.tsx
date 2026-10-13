import type { CSSProperties, ReactNode } from "react";
import { navigate, REPO_URL } from "../App.tsx";
import { ExternalLink, StatusBadge, Tick } from "../components/ui.tsx";
import type { ReconStatus } from "@tieout/recon";

const MAINNET_BATCH = "0x252dd1ff0f0ad77cb2d9fde109cd96de409521d52fbd662e4a9907eed684379e";

const STEPS = [
  { title: "Tag", body: "Every payment carries an ISO 20022 memo through Arc's native Memo contract: EndToEndId, run, purpose, reference." },
  { title: "Anchor", body: "A run is one transaction. Its first call commits a hash of the ledger, so an edit made after payment shows up, entry by entry." },
  { title: "Reconcile", body: "Both directions, three grades of evidence: memo, published reference, unique intent. Ambiguity is held for a person, never guessed." },
  { title: "Verify", body: "An auditor holding only an EndToEndId asks the chain directly. The memo is bound to its transfer by callDataHash." },
  { title: "Book", body: "Balanced entries, a balance roll-forward exact to the wei, and exports for Xero, QuickBooks and ISO 20022 camt.054." },
];

const PRIMITIVES: Array<[string, string]> = [
  ["Memo", "References live in the same transaction as the transfer, indexed by memoId."],
  ["Multicall3From", "A whole run in one transaction, with the payer still msg.sender of every transfer."],
  ["USDC as gas", "Fees are a plain dollar expense. No second asset to value, no disposal for gas."],
  ["EIP-7708 logs", "Even a plain wallet send leaves a transfer log, so nothing moves unseen."],
];

const STATUSES: Array<[ReconStatus, string]> = [
  ["matched", "Memo or reference agrees with the ledger."],
  ["matched_by_intent", "No memo; counterparty and amount match exactly one entry."],
  ["mismatch", "Points to an entry, details differ, and by how much."],
  ["ambiguous", "More than one way to pair. Held for a person."],
  ["missing", "Expected, never happened."],
  ["duplicate", "Settled twice."],
  ["unexpected", "Moved with no entry, in either direction."],
];

const FIGURES: Array<{ n: string; body: string; src: string; href: string }> = [
  {
    n: "70%",
    body: "of 350 corporates and financial institutions would adopt stablecoins sooner with ERP integration.",
    src: "EY-Parthenon, 2025",
    href: "https://www.ey.com/en_us/insights/financial-services/cost-savings-and-speed-drive-stablecoin-adoption",
  },
  {
    n: "$226B",
    body: "of real stablecoin payments in 2025 were business to business: money that has to land in someone's books.",
    src: "McKinsey × Artemis",
    href: "https://www.mckinsey.com/industries/financial-services/our-insights/stablecoins-in-payments-what-the-raw-transaction-numbers-miss",
  },
  {
    n: "0.88×",
    body: "the cost of a plain transfer, for a memo-tagged payment inside a batch. Measured on Arc mainnet.",
    src: "Run PB-202610-I7JR",
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
        A real reconciliation of six of the run's sixteen items.{" "}
        <ExternalLink href={`https://explorer.arc.io/tx/${MAINNET_BATCH}`}>See the batch on Arcscan ↗</ExternalLink>
      </figcaption>
    </figure>
  );
}

function SectionHead({ index, label, title }: { index: string; label: string; title: ReactNode }) {
  return (
    <div>
      <div className="eyebrow">
        <span className="text-slate-400">{index}</span>&nbsp;&nbsp;{label}
      </div>
      <h2 className="display mt-3 text-[34px] leading-[1.05] sm:text-[40px]">{title}</h2>
    </div>
  );
}

export default function Overview() {
  return (
    <div className="space-y-24 pb-6">
      {/* Hero */}
      <section className="grid items-start gap-12 pt-6 lg:grid-cols-[1.08fr_0.92fr] lg:gap-16 lg:pt-12">
        <div className="min-w-0">
          <div className="rise flex flex-wrap items-center gap-3" style={stagger(0)}>
            <span className="eyebrow">Reconciliation layer for Arc</span>
            <ExternalLink href={`https://explorer.arc.io/tx/${MAINNET_BATCH}`} className="chip no-underline hover:no-underline">
              <span className="h-1.5 w-1.5 bg-emerald-500" aria-hidden />
              Live on mainnet
            </ExternalLink>
          </div>
          <h1 className="display rise mt-6 text-[52px] leading-[0.98] text-balance sm:text-[76px]" style={stagger(1)}>
            USDC settles in under a second. <em className="text-emerald-700">Your books should keep up.</em>
          </h1>
          <p className="rise mt-7 max-w-[34rem] text-[17px] leading-relaxed text-slate-600 text-pretty" style={stagger(2)}>
            Tieout ties every USDC payment and receipt on Arc to the ledger entry it settles, flags what doesn't match, and hands your
            accountant balanced entries.
          </p>
          <div className="rise mt-9 flex flex-wrap gap-3" style={stagger(3)}>
            <button className="btn-primary" onClick={() => navigate("console", "demo")}>Run the mainnet demo →</button>
            <button className="btn-secondary" onClick={() => navigate("verify")}>Verify a payment</button>
            <button className="btn-secondary" onClick={() => navigate("pay")}>Pay or request</button>
          </div>
          <p className="rise mt-6 font-mono text-[11px] leading-relaxed text-slate-500" style={stagger(4)}>
            Runs in your browser against a public Arc RPC.
            <br className="hidden sm:block" /> No backend · no keys held · no custom contracts.
          </p>
        </div>
        <TieOutSheet />
      </section>

      {/* Figures, set like notes to a statement */}
      <section className="border-y border-slate-800">
        <div className="grid divide-y divide-slate-300 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {FIGURES.map((f, i) => (
            <div key={f.n} className="px-1 py-7 sm:px-7 sm:first:pl-0 sm:last:pr-0">
              <div className="display nums text-[54px] leading-none">
                {f.n}
                <sup className="ml-1 font-mono text-[12px] text-slate-400">{i + 1}</sup>
              </div>
              <p className="mt-4 text-[14px] leading-relaxed text-slate-600">{f.body}</p>
              <ExternalLink href={f.href} className="mt-3 inline-block font-mono text-[11px] text-slate-500">
                {i + 1}. {f.src}
              </ExternalLink>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <SectionHead index="01" label="How it works" title={<>Five steps.<br />One transaction per run.</>} />
          <p className="mt-5 max-w-sm text-[15px] leading-relaxed text-slate-600">
            The ledger stays your system of record. Arc becomes legible to it.
          </p>
        </div>
        <ol className="border-t border-slate-800">
          {STEPS.map((s, i) => (
            <li key={s.title} className="grid grid-cols-[3rem_1fr] gap-4 border-b border-slate-300 py-6 sm:grid-cols-[4rem_10rem_1fr] sm:gap-6">
              <span className="nums pt-1 font-mono text-[12px] text-slate-400">0{i + 1}</span>
              <h3 className="display text-[28px] leading-none">{s.title}</h3>
              <p className="col-start-2 text-[15px] leading-relaxed text-slate-600 sm:col-start-3 sm:pt-0.5">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Outcomes */}
      <section className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <SectionHead index="02" label="Outcomes" title={<>Seven outcomes.<br /><em>Nothing silent.</em></>} />
          <p className="mt-5 max-w-sm text-[15px] leading-relaxed text-slate-600">
            Every ledger entry and every transfer lands in exactly one bucket, with its grade of evidence beside it.
          </p>
        </div>
        <div className="border-t border-slate-800">
          {STATUSES.map(([status, body]) => (
            <div key={status} className="grid grid-cols-[8.5rem_1fr] items-center gap-4 border-b border-slate-300 py-3.5 text-[15px]">
              <div><StatusBadge status={status} /></div>
              <div className="text-slate-700">{body}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Built on Arc */}
      <section className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <SectionHead index="03" label="Built on Arc" title={<>Arc's own primitives.<br />Nothing added.</>} />
        </div>
        <div>
          <dl className="border-t border-slate-800">
            {PRIMITIVES.map(([name, why]) => (
              <div key={name} className="grid gap-1 border-b border-slate-300 py-4 sm:grid-cols-[11rem_1fr] sm:gap-6">
                <dt className="font-mono text-[13px] font-medium text-ink">{name}</dt>
                <dd className="text-[15px] leading-relaxed text-slate-600">{why}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-6 border-l-[3px] border-emerald-600 pl-4 text-[15px] leading-relaxed text-slate-700">
            <span className="font-semibold text-ink">Any payer.</span> EOA, Safe, custodian or a plain wallet send; payouts out and invoices
            in. A reference published afterwards gives a memo-less payment the same evidence as a memo.
          </p>
        </div>
      </section>

      {/* Closing */}
      <section className="border-y-[3px] border-double border-slate-800 py-12 sm:py-16">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <blockquote className="display max-w-3xl text-[38px] leading-[1.05] sm:text-[52px]">
            Others prove the money moved. <em className="text-emerald-700">Tieout proves the books are right.</em>
          </blockquote>
          <div className="flex shrink-0 flex-col items-start gap-4 lg:items-end">
            <div className="flex gap-3">
              <button className="btn-primary" onClick={() => navigate("console", "demo")}>Run the demo →</button>
              <ExternalLink href={REPO_URL} className="btn-secondary no-underline hover:no-underline">Source</ExternalLink>
            </div>
            <p className="max-w-xs font-mono text-[11px] leading-relaxed text-slate-500 lg:text-right">
              Apache-2.0 · a memo convention for the whole chain, an SDK to compose with, an audit bundle anyone can re-run.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
