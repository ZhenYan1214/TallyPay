import { navigate } from "../App.tsx";
import { ExternalLink, StatusBadge } from "../components/ui.tsx";
import type { ReconStatus } from "@tieout/recon";

const MAINNET_BATCH = "0x252dd1ff0f0ad77cb2d9fde109cd96de409521d52fbd662e4a9907eed684379e";

const STEPS = [
  {
    title: "Tag",
    body: "Each payment carries an ISO 20022-style memo (EndToEndId, PmtInfId, purpose, reference) through Arc's native Memo contract. Identifiers only, never personal data.",
  },
  {
    title: "Batch and anchor",
    body: "A whole payout run goes out in one transaction via Arc's Multicall3From. The first call anchors a hash of the ledger, so later edits are detectable, and doubles as the run's idempotency key.",
  },
  {
    title: "Reconcile",
    body: "Both directions, three grades of evidence: the memo in the transaction, a reference published afterwards for payments a Safe or custodian sent, or counterparty and amount when the pairing is unique. Anything ambiguous is held for a person, never guessed.",
  },
  {
    title: "Verify",
    body: "Anyone holding only an EndToEndId can find the payment on-chain through Arc's indexed memoId, and see that the memo's callDataHash matches that exact transfer.",
  },
  {
    title: "Book",
    body: "Matched payouts and receipts become balanced journal entries; exceptions land in suspense; the balance is rolled forward against the chain, exact to the wei. Export for Xero, QuickBooks, or as an ISO 20022 camt.054 notification.",
  },
];

const PRIMITIVES = [
  { name: "Memo contract", why: "Payment references live in the same transaction as the transfer and are indexed by memoId." },
  { name: "Multicall3From", why: "Batches keep the payer as msg.sender, so every transfer and memo is attributed to the paying wallet." },
  { name: "USDC as gas", why: "Network fees are a plain USD expense. No second asset to value, no disposal events for gas." },
  { name: "Deterministic finality", why: "One confirmation is final, so an entry can be booked the moment it lands." },
  { name: "EIP-7708 transfer logs", why: "Even a plain wallet send of native USDC leaves a log, so Tieout sees every movement, not only ERC-20 calls." },
];

const STATUSES: Array<[ReconStatus, string]> = [
  ["matched", "Memo or trusted reference, counterparty, amount and token agree."],
  ["matched_by_intent", "No memo, but counterparty, amount and token match exactly one open entry."],
  ["mismatch", "The memo points to an entry, but the details differ. Short or over by exactly how much."],
  ["ambiguous", "No memo and more than one way to pair. Held for a person, settled with one click."],
  ["missing", "The ledger expects a payment or receipt that never happened."],
  ["duplicate", "The same entry was settled twice."],
  ["unexpected", "Money moved with no ledger entry, in either direction."],
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
            Tieout ties every USDC payment and receipt on Arc to the ledger entry it settles, flags what doesn't match, and turns the rest into
            journal entries your accountant can import.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <button className="btn-primary" onClick={() => navigate("console", "demo")}>Run the PromptBazaar demo</button>
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

      <section className="grid gap-5 md:grid-cols-3">
        <div className="md:col-span-1">
          <h2 className="text-xl font-semibold tracking-tight">The gap</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Payment rails for stablecoins are crowded. What happens after the money lands is not. Finance teams still match
            transaction hashes to invoices by hand, and the tools that automate it are priced for enterprises and built for
            multi-chain DeFi portfolios.
          </p>
        </div>
        <div className="card p-5">
          <div className="nums text-3xl font-semibold tracking-tight">70%</div>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
            of 350 corporate and financial-institution decision makers told EY-Parthenon they would be more inclined to adopt stablecoins
            with ERP integrations available; 38% cited accounting and tax treatment as a barrier.
          </p>
          <ExternalLink className="mt-2 inline-block text-xs text-slate-500" href="https://www.ey.com/en_us/insights/financial-services/cost-savings-and-speed-drive-stablecoin-adoption">EY-Parthenon, Sept 2025 (n=350)</ExternalLink>
        </div>
        <div className="card p-5">
          <div className="nums text-3xl font-semibold tracking-tight">0 new contracts</div>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
            Arc already has the primitives: memos, batching, dollar-denominated fees, instant finality. Tieout wires them into a
            ledger workflow instead of adding new contracts.
          </p>
        </div>
      </section>

      <section>
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="eyebrow">How it works</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight">Five steps, one transaction per run</h2>
          </div>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-5">
          {STEPS.map((s, i) => (
            <div key={s.title} className="card p-5">
              <div className="nums flex h-7 w-7 items-center justify-center rounded-full bg-ink text-xs font-semibold text-white">{i + 1}</div>
              <h3 className="mt-3 font-semibold">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-8 lg:grid-cols-2">
        <div>
          <p className="eyebrow">Built on Arc</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">Arc's own primitives, nothing added</h2>
          <p className="mt-1 text-sm text-slate-600">No custom contracts. Everything uses what Arc ships at genesis.</p>
          <dl className="mt-4 space-y-3">
            {PRIMITIVES.map((p) => (
              <div key={p.name} className="card p-4">
                <dt className="font-semibold">{p.name}</dt>
                <dd className="mt-0.5 text-sm leading-relaxed text-slate-600">{p.why}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div>
          <p className="eyebrow">Outcomes</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">Seven outcomes, nothing silent</h2>
          <p className="mt-1 text-sm text-slate-600">Every ledger entry and every transfer ends up in exactly one bucket, with its grade of evidence.</p>
          <div className="card mt-4 divide-y divide-slate-100">
            {STATUSES.map(([status, body]) => (
              <div key={status} className="flex items-start gap-4 p-4 text-sm">
                <div className="w-40 shrink-0 pt-0.5"><StatusBadge status={status} /></div>
                <div className="leading-relaxed text-slate-600">{body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="card grid gap-8 p-6 sm:p-8 md:grid-cols-2">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Works with any payer</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Tieout doesn't move money. It reconciles whatever wallet you point it at, whether payouts were sent through Tieout's
            batch builder, a payouts provider, a Safe, or by hand, and whether money went out to payees or came in against your invoices.
            Payment request links put your invoice id into the payer's memo so receipts reconcile themselves; references published afterwards
            give Safe and custodial payments the same evidence as a memo.
          </p>
        </div>
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Next</h2>
          <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-slate-600">
            {[
              "Webhook ingestion from payouts providers on Arc",
              "Direct sync to Xero and QuickBooks via their APIs",
              "EURC and local stablecoins with recorded FX rates",
              "View-key based audits once Arc's opt-in privacy ships",
              "Propose the tp1 memo schema to the Arc team as a shared convention",
            ].map((t) => (
              <li key={t} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-slate-400" aria-hidden />{t}</li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
