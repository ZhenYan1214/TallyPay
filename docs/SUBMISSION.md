# DoraHacks submission kit

Everything needed for the Arc Microgrants form, ready to paste once the mainnet run is done. Replace every `TODO` first.

## Pre-flight (all must be true before submitting)

- [x] `npm run demo -- --network=arc-mainnet` run on 2026-10-13: run `PB-202610-I7JR`, 7 transactions, payer fees 0.018344 USDC
- [x] `npm run snapshot` and `npm run gas` run; README "What it costs" shows mainnet numbers
- [x] README top links filled in (live URL assumes GitHub Pages on the ZhenYan1214/ARC repository)
- [ ] Repo is public, GitHub Pages enabled (Settings → Pages → Source: GitHub Actions), the Actions run is green
- [ ] Open the live URL in a private window: Overview → "Run the PromptBazaar demo" reconciles the **mainnet** run without any clicks; the balance roll-forward shows "fully explained"
- [ ] Verify page: "Use a demo payment · Arc Mainnet" → "Look up" finds the memo
- [ ] Pay page: "Request a payment" produces a link; opening it prefills the Send tab
- [ ] Reconcile page: the demo's intent-matched payment shows the "Attach references on-chain" card; the seller-11 case shows evidence "reference"
- [ ] Reconcile page: clear the ledger, paste any mainnet wallet, "Statement for this wallet" works
- [ ] Export → Audit bundle, then `npm run verify-bundle -- <file> --rescan` prints "Bundle verified" and "Chain matches"
- [ ] Open the live URL on a phone: no horizontal scroll, nav fits
- [ ] Pay page shows Arc Mainnet by default
- [ ] GitHub profile is public with a name, avatar and at least this pinned repo
- [ ] Demo funds swept back: `npm run sweep -- --network=arc-mainnet` (optional, after the review period)

## Form fields

**Project name**
Tieout

**Tagline (one line)**
The reconciliation layer for USDC on Arc: every payment and receipt matched to the ledger entry it settles, exceptions flagged, books ready for Xero, QuickBooks or an ISO 20022 feed.

**Live deployment**
https://zhenyan1214.github.io/ARC/

**Repository**
https://github.com/ZhenYan1214/ARC

**Builder profile**
https://github.com/ZhenYan1214

**Category / tags**
Payments infrastructure · Treasury · Accounting · Developer tooling · USDC · Memo

**Project description** (what it does, what it uses Arc for)

> USDC settles on Arc in under a second. Recording it still takes a finance team days of matching transaction hashes to invoices by hand. Arc's own Treasury blueprint names it: "reconciliation can require multiple teams and systems". Tieout is the layer that closes that gap, on Arc's own primitives.
>
> **What it does.** You keep your ledger (CSV or JSON; payee names stay off-chain). Tieout reads the wallet's activity from any public Arc RPC, in both directions, and matches every USDC movement to the ledger entry it settles: payouts to payees, receipts against invoices. Everything lands in one of seven buckets: matched, matched by intent (no memo, e.g. sent from a Safe or by a plain wallet send, and only when the pairing is unique), mismatch (with the exact short- or over-paid amount), ambiguous (held for a person, settled with one click and recorded), not paid, duplicate, unexpected. Every settled item carries its grade of evidence: memo, reference, manual, or intent. With no ledger at all, the same engine produces a statement for any Arc wallet, roll-forward and camt.054 included. The wallet balance is rolled forward against the chain, so unexplained movement cannot hide. Matched items become balanced journal entries; exceptions go to suspense. Export for Xero, for QuickBooks Online, or as an ISO 20022 camt.054 notification, the same message family Circle Mint uses for its statements. Anyone holding only an EndToEndId can verify a payment on-chain without a transaction hash.
>
> **What it uses Arc for.** No custom contracts. Each payment is wrapped in Arc's predeployed `Memo` contract with an ISO 20022-style memo (`EndToEndId`, `PmtInfId`, `Purp`, `CdtrRef`), which Arc positions precisely for "stablecoin payment reconciliation" and "batch payouts and disbursements". A payout run is one `Multicall3From` transaction, so the payer EOA stays `msg.sender` of every transfer and `sender` of every memo. The first call anchors a hash of the ledger on-chain; that anchor doubles as the run's idempotency key, so a double-submitted run is refused before it pays everyone twice. Reconciliation ties each memo to its transfer by recomputing `keccak256(transfer(to, amount))` against the memo's `callDataHash`; the Verify page uses the indexed `memoId` topic to find a payment from its identifier alone. Because `Memo` is EOA-only, payments from Safes, custodians and plain wallet sends get a second path: any trusted EOA publishes a `tp1-ref` memo afterwards that names the transaction and shares the payment's memoId, which is the "separate EOA-signed memo transaction" Arc's docs suggest, given a schema and a button. Tieout reads Arc's EIP-7708 system transfer logs as well as the ERC-20 logs, so a native USDC "send" from MetaMask is seen and reconciled, not silently missed. Because gas is USDC, fees are a plain USD expense, booked once per day.
>
> **Why Arc specifically.** Memos in the same transaction as the transfer, batching that preserves the sender, dollar-denominated gas, deterministic finality and a transfer log for every value movement are exactly the properties that make reconciliation deterministic instead of heuristic. Measured on mainnet: a memo-tagged payment inside a batch costs 0.88× a plain transfer sent alone, and the whole seven-transaction demo cost 0.018 USDC in fees.
>
> **Why it is needed.** 70% of corporates and financial institutions say ERP integration would make them more inclined to adopt stablecoins, and 38% name accounting and tax treatment as a barrier (EY-Parthenon, n=350). Real stablecoin payments reached $390B in 2025, 58% of it B2B, which is money that has to land in someone's books. Circle's own framing is that stablecoins are an additive rail with the ERP "holding the audit and accounting position"; Tieout is built for exactly that: the ledger stays the system of record, Arc becomes legible to it. The enterprise subledgers (Bitwave, Cryptio) do not list Arc and start around $300–1,000 a month plus setup; the Arc-native payout tools that exist stop at the receipt. Tieout is the open-source piece in between.
>
> **What is live.** A static web app (no backend, no keys on a server) with four flows: Reconcile, Verify, Pay a run, Request a payment. The PromptBazaar demo, a fictional marketplace paying twelve sellers in twelve countries and invoicing two of them, runs against real Arc mainnet transactions and deliberately includes a memo-less Safe-style payment, a held payment, a post-payment ledger edit, an unrecorded outflow, an invoice paid with a memo, an open invoice and a native-USDC tip nobody recorded. Apache-2.0: SDK (`@tieout/sdk`), reconciliation engine (`@tieout/recon`), CLI, and a written memo spec (`docs/MEMO_SPEC.md`) offered as a proposal for an Arc-wide payment memo convention.
>
> **What we found building on Arc.** Memo calls nest inside `Multicall3From` with correct attribution. Every ERC-20 USDC transfer emits two `Transfer` logs, and a native send emits only the system one, so an indexer that reads the token contract alone misses plain wallet sends entirely. Public RPCs cap `eth_getLogs` at about 10,000 blocks and rate-limit bursts. Transactions under 20 gwei `maxFeePerGas` are dropped silently. `Memo` is EOA-only, so smart-contract wallets need an intent-matching fallback. All documented in the README for the next builder.
>
> **Next.** Webhook ingestion from payout providers on Arc so their runs reconcile without changing how they pay; direct Xero and QuickBooks sync; the salted memoId variant for payers who need unlinkability; refund and instalment references; view-key audits once Arc's opt-in privacy ships. We would use the microgrant to integrate with one payout provider already on Arc and to propose the memo schema to the Arc team as a public good.

**Mainnet proof**
Batch transaction: https://explorer.arc.io/tx/0x252dd1ff0f0ad77cb2d9fde109cd96de409521d52fbd662e4a9907eed684379e
Paying wallet: https://explorer.arc.io/address/0x2ccb42B46e63BdA5eecc216bFDFC7a4a26A2e841
Reference published after the fact: https://explorer.arc.io/tx/0xb7e0b214e10048d94f09c10c616f2d2d0f7ae6c143766d501516d9bdc5d1de74
Invoice paid with a memo by a seller: https://explorer.arc.io/tx/0x3e89f95b505a01855c26844d04070fdc2ae00ad4431b45a127710fdb8eff9467

## 90-second video script

| Time | Screen | Say |
|---|---|---|
| 0:00 | Overview page | "Paying in USDC on Arc is solved. Recording it isn't. Tieout matches every payment and every receipt to your ledger and writes the journal entries." |
| 0:08 | Click "Run the PromptBazaar demo" | "A fictional marketplace, twelve sellers, twelve countries, two invoices. The transactions are real, on Arc mainnet." |
| 0:18 | Results; point at the scenario card | "Ten paid in one batch with memos. One from a Safe, no memo. One on hold. One edited after payment. One unrecorded outflow. One invoice paid with a memo, one still open, one tip nobody recorded." |
| 0:35 | Six status chips, anchor badge, roll-forward table | "Every entry lands in exactly one bucket. The on-chain anchor pinpoints the edited entry. Opening balance plus receipts minus payments minus fees equals closing: fully explained." |
| 0:50 | Click a transaction link; explorer | "Each memo sits in the same transaction as its transfer, through Arc's native Memo and Multicall3From. No custom contracts." |
| 1:00 | Verify page; paste an EndToEndId; Look up | "An auditor with only the invoice id finds the payment. Arc indexes the memoId." |
| 1:10 | Pay → Request a payment; copy link; open it | "Send a payment request link. The payer's memo carries your invoice id, so the receipt reconciles itself." |
| 1:20 | Journal tab, then Export | "Balanced entries, exceptions to suspense. Export to Xero, QuickBooks, or an ISO 20022 camt.054 feed, the format Circle Mint already speaks." |
| 1:28 | README "What it costs" | "A memo-tagged payment in a batch costs less than a plain transfer. Open source, Apache-2.0." |

## Answers to likely reviewer questions

**Isn't this what Circle Mint payout reports already give me?** Those cover payouts sent through Circle Mint, as camt.053 statements. Tieout reconciles whatever wallet you point it at, in both directions, and emits the sibling message, camt.054, for that wallet. They compose.

**Why not a custom contract?** Arc ships `Memo` and `Multicall3From` at genesis. Reimplementing them would add audit surface and prove nothing. Using them well is the point.

**Why JSON memos?** Legible on explorers and in audit files, decodable with no tooling, and the keys map one-to-one to ISO 20022 elements. The cost is negligible next to the per-transaction base fee; the spec reserves a `tp2` prefix for a binary encoding if that ever changes.

**Why a zero-value self-transfer for the anchor?** `Memo` needs an inner call to wrap. A `transfer(payer, 0)` is the cheapest harmless call. The reader filters it out.

**Won't a deterministic memoId let anyone enumerate my payments?** It lets anyone who knows an id find that payment, which is the feature for payees and auditors. The spec defines a salted variant for payers who need unlinkability; it is reserved, not yet implemented.

**What about Safe and MPC wallets, or people who just hit "Send" in MetaMask?** `Memo` is EOA-only on Arc today, and a plain send carries no memo at all. Tieout reads the EIP-7708 system logs so those sends are seen, matches them on counterparty, token and amount only when the pairing is unique (labelled `matched_by_intent`), holds anything ambiguous for a person, and then lets any trusted EOA publish on-chain references so those payments become first-class evidence, findable by id, for every future audit.

**Who uses this?** Small platforms paying many overseas contractors, businesses invoicing in USDC, and their accountants. Promise over traction: the microgrant is for the first proof. The path is webhook ingestion from payout providers already on Arc, so their customers get reconciliation without changing how they pay.

**Is the accounting right?** Entries are templates for an accountant to review, and the app says so on every page. Account codes are configurable. Stablecoin classification is still moving (FASB proposal, August 2026, comments due November), which is exactly why the output is a reviewable journal and not a filed return, and why the roll-forward reports balances per token.
