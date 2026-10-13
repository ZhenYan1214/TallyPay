# DoraHacks submission kit

Everything needed for the Arc Microgrants form, ready to paste once the mainnet run is done. Replace every `TODO` first.

## Pre-flight (all must be true before submitting)

- [ ] `npm run demo -- --network=arc-mainnet` has been run; `apps/web/public/demo/promptbazaar-arc-mainnet.json` exists
- [ ] `npm run snapshot -- apps/web/public/demo/promptbazaar-arc-mainnet.json` has been run; `.activity.json` exists next to it
- [ ] `npm run gas -- apps/web/public/demo/promptbazaar-arc-mainnet.json` output pasted into README "What it costs"
- [ ] README top links filled in: live app URL, mainnet batch transaction
- [ ] Repo is public, GitHub Pages enabled (Settings → Pages → Source: GitHub Actions), the Actions run is green
- [ ] Open the live URL in a private window: Overview → "Run the PromptBazaar demo" reconciles the **mainnet** run without any clicks
- [ ] Verify page: "Use a demo payment · Arc Mainnet" → "Look up" finds the memo
- [ ] Pay page shows Arc Mainnet by default
- [ ] GitHub profile is public with a name, avatar and at least this pinned repo
- [ ] Demo funds swept back: `npm run sweep -- --network=arc-mainnet` (optional, after the review period)

## Form fields

**Project name**
Tallypay

**Tagline (one line)**
The reconciliation layer for USDC on Arc: every payment matched to the ledger entry it pays, exceptions flagged, journal entries ready for Xero.

**Live deployment**
TODO https://<user>.github.io/<repo>/

**Repository**
TODO https://github.com/<user>/<repo>

**Builder profile**
TODO https://github.com/<user>

**Category / tags**
Payments infrastructure · Accounting · Developer tooling · USDC · Memo

**Project description** (what it does, what it uses Arc for)

> USDC settles on Arc in under a second. Recording it still takes a finance team days of matching transaction hashes to invoices by hand. Tallypay closes that gap.
>
> **What it does.** You keep your payout ledger (CSV or JSON, with payee names kept off-chain). Tallypay reads the paying wallet's activity from any public Arc RPC, matches every outgoing USDC transfer to the ledger entry it pays, and sorts everything into six buckets: matched, matched by intent (no memo, e.g. sent from a Safe), mismatch, not paid, duplicate, unexpected. Matched payouts become balanced double-entry journal entries; exceptions go to suspense. Export a review CSV, a generic journal, or a Xero manual-journal import file. Anyone holding only an EndToEndId can verify the payment on-chain without a transaction hash.
>
> **What it uses Arc for.** No custom contracts. Each payment is wrapped in Arc's predeployed `Memo` contract with an ISO 20022-style memo (`EndToEndId`, `PmtInfId`, `Purp`, `CdtrRef`). A payout run is one `Multicall3From` transaction, so the payer EOA stays `msg.sender` of every transfer and `sender` of every memo. The first call of the batch anchors a hash of the ledger on-chain, so edits made after payment are detectable down to the entry. Reconciliation ties each memo to its transfer by recomputing `keccak256(transfer(to, amount))` against the memo's `callDataHash`, and the Verify page uses the indexed `memoId` topic to find a payment from its identifier alone. Because gas is USDC, network fees are booked as a plain USD expense, once per day.
>
> **Why Arc specifically.** Memos in the same transaction as the transfer, batching that preserves the sender, dollar-denominated gas and deterministic finality are exactly the four properties that make reconciliation deterministic instead of heuristic. We measured on-chain: a memo-tagged payment inside a batch costs less than a plain transfer sent alone.
>
> **What is live.** A static web app (no backend, no keys on a server) with three flows: Reconcile, Verify, Pay a run. A PromptBazaar demo, a fictional marketplace paying twelve sellers, runs against real Arc mainnet transactions and deliberately includes a memo-less Safe-style payment, a held payment, a post-payment ledger edit and an unrecorded outflow. Everything is Apache-2.0: an SDK (`@tallypay/sdk`), a reconciliation engine (`@tallypay/recon`), CLI scripts and a written memo spec (`docs/MEMO_SPEC.md`) offered as a proposal for an Arc-wide payment memo convention.
>
> **What we found building on Arc.** Memo calls nest inside `Multicall3From` and attribution stays correct. Every USDC transfer emits two `Transfer` logs (token contract, 6 decimals; EIP-7708 system emitter, 18 decimals), so naive indexers double count. Public RPCs cap `eth_getLogs` at about 10,000 blocks. Transactions under 20 gwei `maxFeePerGas` are dropped silently. `Memo` is EOA-only, so smart-contract wallets need an intent-matching fallback. All of this is documented in the README for the next builder.
>
> **Next.** Direct Xero and QuickBooks sync, webhook ingestion from payout providers on Arc so their runs reconcile automatically, EURC with recorded FX rates, and view-key audits once Arc's opt-in privacy ships. We would use the microgrant to fund the first integration with a payout provider already on Arc and to propose the memo schema to the Arc team as a public good.

**Mainnet proof**
TODO Batch transaction: https://explorer.arc.io/tx/0x…
TODO Paying wallet: https://explorer.arc.io/address/0x…

## 90-second video script

| Time | Screen | Say |
|---|---|---|
| 0:00 | Overview page | "Paying in USDC on Arc is solved. Recording it isn't. Tallypay matches every payment to your ledger and writes the journal entries." |
| 0:10 | Click "Run the PromptBazaar demo" | "This is a fictional marketplace paying twelve sellers. The transactions are real, on Arc mainnet." |
| 0:20 | Results load; point at the scenario card | "Ten paid in one batch with memos. One paid from a Safe with no memo. One on hold. One edited after payment. One unrecorded outflow." |
| 0:35 | Point at the six status chips and the anchor badge | "Every entry lands in exactly one bucket. The on-chain anchor pinpoints the edited entry: 0.15 became 0.135." |
| 0:50 | Click a transaction link; show the explorer | "Each memo sits in the same transaction as its transfer, through Arc's native Memo and Multicall3From. No custom contracts." |
| 1:00 | Verify page; paste an EndToEndId; Look up | "An auditor with only the invoice id can find the payment. Arc indexes the memoId." |
| 1:15 | Journal tab, then Export → Xero | "Matched payouts become balanced entries. Exceptions go to suspense. Export straight into Xero." |
| 1:25 | README "What it costs" table | "A memo-tagged payment in a batch costs less than a plain transfer. Open source, Apache-2.0." |

## Answers to likely reviewer questions

**Isn't this what Circle Mint payout reports already give me?** Those cover payouts sent through Circle Mint. Tallypay reconciles whatever wallet you point it at: Tallypay batches, a payouts provider, a Safe, or someone sending by hand.

**Why not a custom contract?** Arc ships `Memo` and `Multicall3From` at genesis. Reimplementing them would add audit surface and prove nothing. Using them well is the point.

**Why JSON memos?** Legible on explorers and in audit files, decodable with no tooling, and the keys map one-to-one to ISO 20022 elements. The cost is negligible next to the per-transaction base fee; the spec reserves a `tp2` prefix for a binary encoding if that ever changes.

**Why a zero-value self-transfer for the anchor?** `Memo` needs an inner call to wrap. A `transfer(payer, 0)` is the cheapest harmless call. The reader filters it out.

**What about Safe and MPC wallets?** `Memo` is EOA-only on Arc today. Tallypay falls back to intent matching on recipient, token and amount, and labels those matches differently so an accountant knows the evidence is weaker.

**Who uses this?** Small platforms paying many overseas contractors, and their accountants. Promise over traction: the microgrant is for the first proof. The path is webhook ingestion from payout providers already on Arc, so their customers get reconciliation without changing how they pay.

**Is the accounting right?** Entries are templates for an accountant to review, and the app says so on every page. Account codes are configurable. Stablecoin classification is still moving (FASB proposal, August 2026), which is exactly why the output is a reviewable journal and not a filed return.
