import { navigate } from "../App.tsx";
import { ExternalLink, StatusBadge } from "../components/ui.tsx";
import type { ReconStatus } from "@tieout/recon";

const MAINNET_BATCH = "0x252dd1ff0f0ad77cb2d9fde109cd96de409521d52fbd662e4a9907eed684379e";

const STEPS: Array<[string, string]> = [
  ["Tag", "ISO 20022 memo on every payment, through Arc's native Memo contract."],
  ["Anchor", "One transaction per run; the ledger hash goes first, so later edits show."],
  ["Reconcile", "Both directions, three grades of evidence. Ambiguity is held, never guessed."],
  ["Verify", "Find any payment from its EndToEndId alone, bound by callDataHash."],
  ["Book", "Balanced entries, roll-forward to the wei, Xero, QuickBooks, camt.054."],
];

const PRIMITIVES: Array<[string, string]> = [
  ["Memo", "References live in the transaction, indexed by memoId."],
  ["Multicall3From", "Batches keep the payer as msg.sender."],
  ["USDC as gas", "Fees are a plain USD expense."],
  ["EIP-7708 logs", "Even a plain wallet send leaves a trace."],
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

export default function Overview() {
  return (
    <div className="space-y-16">
      <section className="grid items-center gap-10 pt-2 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="eyebrow">Reconciliation layer for Arc</p>
            <ExternalLink href={`https://explorer.arc.io/tx/${MAINNET_BATCH}`} className="chip no-underline hover:no-underline">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
              Live on Arc mainnet
            </ExternalLink>
          </div>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-balance text-slate-900 sm:text-[52px] sm:leading-[1.05]">
            USDC settles in under a second. Your books should keep up.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-600 text-pretty">
            Tieout ties every USDC payment and receipt on Arc to the ledger entry it settles, flags what doesn't match, and hands your accountant balanced entries.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <button className="btn-primary" onClick={() => navigate("console", "demo")}>Run the mainnet demo</button>
            <button className="btn-secondary" onClick={() => navigate("verify")}>Verify a payment</button>
            <button className="btn-secondary" onClick={() => navigate("pay")}>Pay or request</button>
          </div>
          <p className="mt-4 text-xs text-slate-500">Runs in your browser against a public Arc RPC. No backend, no keys, no custom contracts.</p>
        </div>
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-4 py-2.5">
            <span className="text-xs font-semibold text-slate-600">Memo attached to one payout</span>
            <span className="font-mono text-[10px] text-slate-400">tp1</span>
          </div>
          <pre className="overflow-x-auto px-4 py-4 font-mono text-[12.5px] leading-relaxed text-slate-800">{`tp1:{
  "EndToEndId": "PB-202610-I7JR-S04",
  "PmtInfId":   "PB-202610-I7JR",
  "Purp":       "COMM",
  "CdtrRef":    "STMT-202610-S04"
}`}</pre>
          <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/80 px-4 py-2.5">
            <span className="text-xs font-semibold text-slate-600">Run anchor, first call of the batch</span>
            <span className="font-mono text-[10px] text-slate-400">tp1-run</span>
          </div>
          <pre className="overflow-x-auto px-4 py-4 font-mono text-[12.5px] leading-relaxed text-slate-800">{`tp1-run:{
  "PmtInfId":   "PB-202610-I7JR",
  "NbOfTxs":    9,
  "CtrlSum":    "1.247",
  "LedgerHash": "0x9c1e…41ab"
}`}</pre>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          ["70%", "of 350 corporates and FIs would adopt stablecoins sooner with ERP integration.", "EY-Parthenon, 2025", "https://www.ey.com/en_us/insights/financial-services/cost-savings-and-speed-drive-stablecoin-adoption"],
          ["$226B", "of real stablecoin payments in 2025 were B2B, money that lands in someone's books.", "McKinsey × Artemis", "https://www.mckinsey.com/industries/financial-services/our-insights/stablecoins-in-payments-what-the-raw-transaction-numbers-miss"],
          ["0.88×", "the cost of a plain transfer for a memo-tagged payment in a batch, measured on mainnet.", "This repository", `https://explorer.arc.io/tx/${MAINNET_BATCH}`],
        ].map(([n, body, src, href]) => (
          <div key={n} className="card p-5">
            <div className="nums text-3xl font-semibold tracking-tight">{n}</div>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{body}</p>
            <ExternalLink href={href!} className="mt-2 inline-block text-xs text-slate-500">{src}</ExternalLink>
          </div>
        ))}
      </section>

      <section>
        <p className="eyebrow">How it works</p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight">Five steps, one transaction per run</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {STEPS.map(([title, body], i) => (
            <div key={title} className="card p-5">
              <div className="nums flex h-7 w-7 items-center justify-center rounded-full bg-ink text-xs font-semibold text-white">{i + 1}</div>
              <h3 className="mt-3 font-semibold">{title}</h3>
              <p className="mt-1 text-[13.5px] leading-relaxed text-slate-600">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-8 lg:grid-cols-2">
        <div>
          <p className="eyebrow">Outcomes</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">Seven outcomes, nothing silent</h2>
          <div className="card mt-4 divide-y divide-slate-100">
            {STATUSES.map(([status, body]) => (
              <div key={status} className="flex items-center gap-4 px-4 py-3 text-sm">
                <div className="w-40 shrink-0"><StatusBadge status={status} /></div>
                <div className="text-slate-600">{body}</div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="eyebrow">Built on Arc</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">Arc's own primitives, nothing added</h2>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            {PRIMITIVES.map(([name, why]) => (
              <div key={name} className="card p-4">
                <dt className="font-semibold">{name}</dt>
                <dd className="mt-0.5 text-sm leading-relaxed text-slate-600">{why}</dd>
              </div>
            ))}
          </dl>
          <div className="card mt-3 p-4 text-sm leading-relaxed text-slate-600">
            <span className="font-semibold text-slate-800">Any payer.</span> EOA, Safe, custodian or plain send; payouts out and invoices in. References published afterwards give memo-less payments the same evidence as a memo.
          </div>
        </div>
      </section>

      <section className="card flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Others prove the money moved. Tieout proves the books are right.</h2>
          <p className="mt-1 text-sm text-slate-600">Open source, Apache-2.0. A memo convention for the whole chain, an SDK to compose with, an audit bundle anyone can re-run.</p>
        </div>
        <div className="flex shrink-0 gap-3">
          <button className="btn-primary" onClick={() => navigate("console", "demo")}>Run the demo</button>
          <ExternalLink href="https://github.com/ZhenYan1214/TallyPay" className="btn-secondary no-underline hover:no-underline">Source</ExternalLink>
        </div>
      </section>
    </div>
  );
}
