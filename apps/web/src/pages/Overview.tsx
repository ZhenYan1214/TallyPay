import { navigate } from "../App.tsx";

const STEPS = [
  {
    title: "Tag",
    body: "Each payment carries an ISO 20022-style memo (EndToEndId, PmtInfId, purpose, reference) through Arc's native Memo contract. Identifiers only, never personal data.",
  },
  {
    title: "Batch and anchor",
    body: "A whole payout run goes out in one transaction via Arc's Multicall3From. The first call anchors a hash of the ledger, so later edits are detectable.",
  },
  {
    title: "Reconcile",
    body: "Tallypay reads the wallet's activity and matches it to your ledger: by memo when present, by recipient and amount when the payer used a Safe or MPC wallet that can't attach memos.",
  },
  {
    title: "Book",
    body: "Matched payouts become balanced journal entries; exceptions land in suspense for review. Export a CSV or a Xero manual journal.",
  },
];

const PRIMITIVES = [
  { name: "Memo contract", why: "Payment references live in the same transaction as the transfer and are indexed by memoId." },
  { name: "Multicall3From", why: "Batches keep the payer as msg.sender, so every transfer and memo is attributed to the paying wallet." },
  { name: "USDC as gas", why: "Network fees are a plain USD expense. No second asset to value, no disposal events for gas." },
  { name: "Deterministic finality", why: "One confirmation is final, so an entry can be booked the moment it lands." },
];

const STATUSES = [
  ["Matched", "Memo, recipient, amount and token agree."],
  ["Matched by intent", "No memo, but recipient, amount and token match an open entry."],
  ["Mismatch", "The memo points to an entry, but the details differ."],
  ["Not paid", "The ledger expects a payment that never happened."],
  ["Duplicate", "The same entry was paid twice."],
  ["Unexpected", "Money left the wallet with no ledger entry."],
];

export default function Overview() {
  return (
    <div className="space-y-14">
      <section className="grid items-center gap-10 pt-4 lg:grid-cols-2">
        <div>
          <p className="text-sm font-semibold text-emerald-700">Reconciliation layer for Arc</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            USDC settles in under a second. Your books should keep up.
          </h1>
          <p className="mt-4 text-lg text-slate-600 text-pretty">
            Tallypay matches every USDC payment on Arc to the ledger entry it pays, flags what doesn't match, and turns the rest into
            journal entries your accountant can import.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button className="btn-primary" onClick={() => navigate("console")}>Try the PromptBazaar demo</button>
            <button className="btn-secondary" onClick={() => navigate("pay")}>Pay a run</button>
          </div>
        </div>
        <div className="card overflow-hidden">
          <div className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs font-medium text-slate-500">Memo attached to one payout</div>
          <pre className="overflow-x-auto p-4 font-mono text-xs leading-relaxed text-slate-800">{`tp1:{
  "EndToEndId": "PB-202610-K3F9-S04",
  "PmtInfId":   "PB-202610-K3F9",
  "Purp":       "COMM",
  "CdtrRef":    "STMT-202610-S04"
}`}</pre>
          <div className="border-t border-slate-100 bg-slate-50 px-4 py-2 text-xs font-medium text-slate-500">Run anchor, first call of the batch</div>
          <pre className="overflow-x-auto p-4 font-mono text-xs leading-relaxed text-slate-800">{`tp1-run:{
  "PmtInfId":   "PB-202610-K3F9",
  "NbOfTxs":    10,
  "CtrlSum":    "1.312",
  "LedgerHash": "0x9c1e…41ab"
}`}</pre>
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-1">
          <h2 className="text-xl font-semibold">The gap</h2>
          <p className="mt-2 text-sm text-slate-600">
            Payment rails for stablecoins are crowded. What happens after the money lands is not. Finance teams still match
            transaction hashes to invoices by hand, and the tools that automate it are priced for enterprises and built for
            multi-chain DeFi portfolios.
          </p>
        </div>
        <div className="card p-5">
          <div className="text-3xl font-semibold">70%</div>
          <p className="mt-1 text-sm text-slate-600">
            of 350 executives in an EY-Parthenon survey said ERP integration would speed up their stablecoin adoption; 38% cited
            accounting and tax treatment as a barrier.
          </p>
          <a className="mt-2 inline-block text-xs text-slate-500 underline" href="https://www.gdf.io/wp-content/uploads/2026/06/Digital-Finance-Forum-Readout-Q1_2026.pdf" target="_blank" rel="noreferrer">GDF readout, Q1 2026</a>
        </div>
        <div className="card p-5">
          <div className="text-3xl font-semibold">0 new contracts</div>
          <p className="mt-1 text-sm text-slate-600">
            Arc already has the primitives: memos, batching, dollar-denominated fees, instant finality. Tallypay wires them into a
            ledger workflow instead of adding new contracts.
          </p>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold">How it works</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-4">
          {STEPS.map((s, i) => (
            <div key={s.title} className="card p-5">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">{i + 1}</div>
              <h3 className="mt-3 font-semibold">{s.title}</h3>
              <p className="mt-1 text-sm text-slate-600">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="text-xl font-semibold">Built on Arc's own primitives</h2>
          <p className="mt-1 text-sm text-slate-600">No custom contracts. Everything uses what Arc ships at genesis.</p>
          <dl className="mt-4 space-y-3">
            {PRIMITIVES.map((p) => (
              <div key={p.name} className="card p-4">
                <dt className="font-medium">{p.name}</dt>
                <dd className="mt-0.5 text-sm text-slate-600">{p.why}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div>
          <h2 className="text-xl font-semibold">Six outcomes, nothing silent</h2>
          <p className="mt-1 text-sm text-slate-600">Every ledger entry and every outgoing transfer ends up in exactly one bucket.</p>
          <div className="card mt-4 divide-y divide-slate-100">
            {STATUSES.map(([name, body]) => (
              <div key={name} className="flex gap-4 p-4 text-sm">
                <div className="w-36 shrink-0 font-medium">{name}</div>
                <div className="text-slate-600">{body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="card grid gap-6 p-6 md:grid-cols-2">
        <div>
          <h2 className="text-xl font-semibold">Works with any payer</h2>
          <p className="mt-2 text-sm text-slate-600">
            Tallypay doesn't move money. It reconciles whatever wallet you point it at, whether payouts were sent through Tallypay's
            batch builder, a payouts provider, a Safe, or by hand. It complements payment rails rather than competing with them.
          </p>
        </div>
        <div>
          <h2 className="text-xl font-semibold">Next</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
            <li>Direct sync to Xero and QuickBooks via their APIs</li>
            <li>Webhook ingestion from payouts providers on Arc</li>
            <li>EURC and local stablecoins with recorded FX rates</li>
            <li>View-key based audits once Arc's opt-in privacy ships</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
