
![Tieout reconciling a real payout run on Arc mainnet](https://zhenyan1214.github.io/TallyPay/figures/06-app-overview.png)

# Tieout: reconciliation for USDC on Arc

**USDC settles on Arc in under a second. Getting it into the books still takes days.** Tieout matches every USDC payment and receipt on Arc to the ledger entry it settles, flags what doesn't match, ties the wallet balance to the chain to the wei, and exports journal entries for Xero, QuickBooks Online or an ISO 20022 feed.

It is built only on Arc's own predeployed contracts (`Memo` and `Multicall3From`), has no backend and no custom contract, and holds no keys. It is live on Arc mainnet today.

- **Try it**: https://zhenyan1214.github.io/TallyPay/ → *Run the demo* (no wallet needed, 10 seconds)
- **Code**: https://github.com/ZhenYan1214/TallyPay · Apache-2.0 · 58 tests · CI on every push
- **On mainnet**: [Payout batch 0x252dd1ff…379e](https://explorer.arc.io/tx/0x252dd1ff0f0ad77cb2d9fde109cd96de409521d52fbd662e4a9907eed684379e): 9 memo-tagged payments and a ledger anchor in one transaction
- **Arc primitives**: `Memo` · `Multicall3From` · USDC as gas · EIP-7708 transfer logs · deterministic finality

---

## 1. TL;DR

- **Problem.** On-chain, a USDC payment is a `Transfer(from, to, value)`. Nothing in it says which invoice or payout it settles, so finance teams match transaction hashes to spreadsheets by hand. That is the step that stops companies from paying in stablecoins at all.
- **Solution.** Each payment carries an ISO 20022-style memo through Arc's native `Memo` contract. A payout run is one `Multicall3From` transaction with a hash of the ledger anchored in it. Tieout reads the chain, matches every movement in both directions with graded evidence, and outputs reviewable journal entries.
- **Why Arc.** On Arc, all three of these hold at once:
  - the memo lives in the same transaction as the transfer and is cryptographically bound to it (`callDataHash`);
  - gas is paid in dollars;
  - finality is deterministic.

  Together they make reconciliation deterministic instead of heuristic.
- **Status.** Live on Arc mainnet with a real demo run. A memo-tagged payment in a batch costs **0.88×** a plain transfer.

---

## 2. Background

### 2.1 Arc, as of October 2026

![Arc, as of October 2026](https://zhenyan1214.github.io/TallyPay/figures/table-01-arc-timeline.png)

Arc's design choices are aimed at payments and treasury rather than at trading:

- USDC is the gas token, so fees are a dollar amount.
- Finality is deterministic and arrives in under a second.
- Every native value movement emits a log (EIP-7708).
- `Memo` and `Multicall3From` are predeployed at genesis.

### 2.2 Arc is asking for exactly this

Circle and Arc have repeatedly named reconciliation as the gap, and memos as the primitive meant to close it:

- **Arc Treasury blueprint.** "Reconciliation can require multiple teams and systems." ([Arc](https://www.arc.io/blog/how-arc-supports-treasury-management-arc-blueprints))
- **Arc on memos.** Memos are for "stablecoin payment reconciliation" and "batch payouts and disbursements", consumed by the off-chain systems that run accounting and reporting. ([Arc](https://community.arc.io/home/blogs/arc-transaction-memos-structured-transaction-context-for-financial-workflows-on-arc-2026-06-18))
- **Circle, "Stablecoins are an additive rail".** The ERP or treasury system keeps "the audit and accounting position". ([Circle](https://www.circle.com/current/stablecoins-are-an-additive-rail))
- **Circle's CPN roadmap.** It lists reconciliation as a category still waiting for service providers. ([Circle](https://www.circle.com/blog/cpn-momentum-and-upcoming-roadmap))

Arc ships the primitive, but nobody has built the piece that turns `Memo` events into books. That piece is Tieout.

---

## 3. The problem

![Where Tieout fits](https://zhenyan1214.github.io/TallyPay/figures/02-where-tieout-fits.png)

A payment has five steps: initiate, settle, identify, record, and report. Stablecoin rails cover the first two very well. The last three are where finance teams lose days, and on Arc today no tool covers them.

### 3.1 The evidence

![The demand is measured, not assumed](https://zhenyan1214.github.io/TallyPay/figures/table-02-evidence.png)

- Corporates and FIs more inclined to adopt stablecoins if ERP integration existed: [EY-Parthenon, Sept 2025](https://www.ey.com/en_us/insights/financial-services/cost-savings-and-speed-drive-stablecoin-adoption)
- US mid-market CFOs citing integration with existing financial systems: [PYMNTS, Mar 2026](https://www.pymnts.com/study_posts/waiting-for-certainty-why-most-cfos-are-holding-back-on-crypto-and-stablecoins/)
- Real stablecoin payments in 2025: [McKinsey × Artemis, Feb 2026](https://www.mckinsey.com/industries/financial-services/our-insights/stablecoins-in-payments-what-the-raw-transaction-numbers-miss)

### 3.2 What it looks like in practice

- **An ERC-20 log can't answer "which invoice is this for?"** Teams paste explorer links into spreadsheets and match by amount. In crypto accounting vendors' own words, spreadsheets break at a few dozen payouts a month.
- **Plain wallet sends are invisible to naive indexers.** On Arc, a USDC "Send" from MetaMask is a native value transfer that never touches the ERC-20 contract. Reading only the token contract misses it entirely. On one demo wallet, 10 of 14 receipts in a day were native sends.
- **Smart-contract wallets can't use `Memo`.** It is EOA-only, so payments from a Safe, an MPC custodian or an exchange arrive with no context at all.
- **Existing tools don't reach Arc.**

![What exists on Arc today](https://zhenyan1214.github.io/TallyPay/figures/table-03-tools-on-arc.png)

---

## 4. Motivation: why this, why now, why Arc

**Why this.**

- Payment rails for stablecoins are crowded; what happens after the money lands is not. Every B2B payment on Arc ends in somebody's ledger, and today the last mile is manual.
- Circle's own framing is that the ERP stays the system of record. The highest-leverage thing to build is therefore the bridge that makes Arc legible to that system, not another payment app.

**Why now.**

- Arc mainnet launched on 2026-09-16. Payment providers are arriving, and the first finance teams paying on Arc will hit this problem in their first month-end close.
- A memo convention adopted early becomes the default for every indexer and accounting tool on the chain. Adopted late, it becomes one more incompatible format.
- The accounting rules are moving too: in August 2026 FASB proposed that qualifying stablecoins could be classified as cash equivalents.

**Why Arc.** Reconciliation is a join between two datasets, and on Arc the join key can be guaranteed:

![Why Arc: properties that make the join deterministic](https://zhenyan1214.github.io/TallyPay/figures/table-04-why-arc.png)

On Ethereum or a generic L2, none of these can be assumed at the same time. On Arc they are the defaults.

---

## 5. The solution

![Architecture](https://zhenyan1214.github.io/TallyPay/figures/01-architecture.png)

Tieout is a static web app plus two open-source packages (`@tieout/sdk` and `@tieout/recon`) and a CLI.

- **Everything runs in the browser.** Arc's public RPC allows CORS, so the app reads the chain directly.
- **The ledger never leaves the user's machine.** Payee names live only in the ledger and are never written on-chain.
- **Signing is done by the user's own wallet.** There is nothing to breach and nothing to custody.

### 5.1 Four modules

![Four modules](https://zhenyan1214.github.io/TallyPay/figures/table-05-modules.png)

### 5.2 One payout run, one transaction

![One payout run on Arc mainnet](https://zhenyan1214.github.io/TallyPay/figures/03-one-payout-run.png)

**The memo format.** Memos use ISO 20022 field names, so bank and treasury systems map them without translation:

```text
tp1:{"EndToEndId":"PB-202610-I7JR-S01","PmtInfId":"PB-202610-I7JR","Purp":"COMM","CdtrRef":"STMT-202610-S01"}
tp1-run:{"PmtInfId":"PB-202610-I7JR","NbOfTxs":9,"CtrlSum":"1.247","LedgerHash":"0xd03a…c423"}
```

**How the memo is found and bound.**

- `memoId = keccak256("tp1:" + EndToEndId)` is indexed, so an auditor holding only the id finds the payment with a single `eth_getLogs`.
- `keccak256(transfer(to, value)) == Memo.callDataHash` proves which transfer the memo belongs to.

**What the ledger anchor does.** `LedgerHash` commits to the paid lines (`EndToEndId|recipient|amount|token`) without revealing them. Any entry edited after payment is pinpointed: `S04 edited after anchoring (amount 0.15 → 0.135)`.

**What stays off-chain.** Memos carry identifiers only. Names and personal data stay in the ledger.

### 5.3 Matching: strongest evidence first, never a guess

![Matching decision flow](https://zhenyan1214.github.io/TallyPay/figures/04-matching.png)

Every transfer and every ledger line ends in exactly one of seven states:

![Every transfer and ledger line ends in exactly one state](https://zhenyan1214.github.io/TallyPay/figures/table-06-seven-states.png)

Every settled item carries the grade of evidence that settled it:

![Four grades of evidence, strongest first](https://zhenyan1214.github.io/TallyPay/figures/table-07-evidence-grades.png)

**How Safes and MPC wallets get full evidence.** The *reference* grade solves Arc's EOA-only `Memo` limit. After a Safe or custodian pays without a memo, any trusted EOA publishes a reference that names the transaction. From then on the payment is findable by id and reconciles as first-class evidence. This is the "separate EOA-signed memo transaction" Arc's docs suggest as a workaround; Tieout gives it a schema and a button.

### 5.4 Nothing can hide: whole-run checks

- **Balance roll-forward.** `opening + in − out − fees = on-chain closing`, computed in wei for each token. If the scan missed anything, the roll-forward won't tie, and the screen says so.
- **Ledger anchor.** Re-hashes the ledger and names the exact entry edited after payment.
- **Audit bundle.** Ledgers, the chain scan and every decision in one file. `npm run verify-bundle -- audit.json --rescan` recomputes the report and checks the chain still agrees.

### 5.5 Output an accountant can use

![Output an accountant can use](https://zhenyan1214.github.io/TallyPay/figures/table-08-exports.png)

Journal entries are templates for an accountant to review, and the app says so on every page.

---

## 6. Live on Arc mainnet: the PromptBazaar demo

PromptBazaar is a fictional AI-prompt marketplace. It pays 12 sellers in 12 countries and invoices two of them. **The marketplace is simulated, but every transaction is real on Arc mainnet** (small amounts). The scenario deliberately includes everything that goes wrong in practice:

![PromptBazaar demo: every case is a real Arc mainnet transaction](https://zhenyan1214.github.io/TallyPay/figures/table-09-demo-cases.png)

On-chain transactions in this table:

- 9 sellers: [0x252dd1ff…379e](https://explorer.arc.io/tx/0x252dd1ff0f0ad77cb2d9fde109cd96de409521d52fbd662e4a9907eed684379e)
- Seller 07: [0x09140a73…ea19](https://explorer.arc.io/tx/0x09140a733ee74c8198bfb42664fa3dfc5547130142ac93562e00fbf0e24fea19)
- Seller 11, the payment: [0x4920d77f…133d](https://explorer.arc.io/tx/0x4920d77f5001a6e941d98a74c83b15b6515b4905cac5b596d942153e746e133d)
- Seller 11, the reference published later: [0xb7e0b214…de74](https://explorer.arc.io/tx/0xb7e0b214e10048d94f09c10c616f2d2d0f7ae6c143766d501516d9bdc5d1de74)
- Unrecorded outflow: [0x4dafe415…8da2](https://explorer.arc.io/tx/0x4dafe415122c112b4fecba1eafd2554b7bfc4e8f9a1b1284ade30bad5bbe8da2)
- Seller 09: [0x3e89f95b…9467](https://explorer.arc.io/tx/0x3e89f95b505a01855c26844d04070fdc2ae00ad4431b45a127710fdb8eff9467)
- Seller 03: [0xd0a300d5…c518](https://explorer.arc.io/tx/0xd0a300d52820378dc564364211c436c5b3c60d969fa0707f5e0198e308fec518)

**Result.** Every case lands in the expected bucket, and the balance roll-forward reads *fully explained*: unexplained difference 0.000000 USDC. Payer wallet: [0x2ccb42…e841](https://explorer.arc.io/address/0x2ccb42B46e63BdA5eecc216bFDFC7a4a26A2e841).

![Reconcile results](https://zhenyan1214.github.io/TallyPay/figures/07-app-reconcile.png)

**Verify: find a payment from its id alone.** An auditor pastes `PB-202610-I7JR-S01`. Tieout finds the payment through Arc's indexed `memoId` and shows that `callDataHash` binds the memo to that exact transfer.

![Verify a payment](https://zhenyan1214.github.io/TallyPay/figures/08-app-verify.png)

**Try it yourself in 60 seconds.**

1. Open the [live app](https://zhenyan1214.github.io/TallyPay/) → **Run the demo**. It scans Arc mainnet from your browser.
2. Open **Verify** → **Use a demo payment** → **Look up**.
3. Open **Pay a run** → **Request a payment**, copy the link and open it: the payer side is prefilled with your invoice id.
4. Open **Journal entries** and **Export** to get the Xero, QuickBooks and camt.054 files.
5. Clear the ledger, paste any Arc wallet and click **Statement for this wallet**.

---

## 7. What it costs on Arc

![Measured cost on mainnet](https://zhenyan1214.github.io/TallyPay/figures/05-cost-on-mainnet.png)

Measured from mainnet receipts (`npm run gas`, 21 gwei, 2026-10-13):

![Measured on Arc mainnet · 21 gwei · 2026-10-13](https://zhenyan1214.github.io/TallyPay/figures/table-10-cost.png)

On-chain transactions in this table:

- Batch, 9 memo payments + anchor: [0x252dd1ff…379e](https://explorer.arc.io/tx/0x252dd1ff0f0ad77cb2d9fde109cd96de409521d52fbd662e4a9907eed684379e)
- Plain transfer, no memo: [0x09140a73…ea19](https://explorer.arc.io/tx/0x09140a733ee74c8198bfb42664fa3dfc5547130142ac93562e00fbf0e24fea19)
- Single memo payment (invoice): [0x3e89f95b…9467](https://explorer.arc.io/tx/0x3e89f95b505a01855c26844d04070fdc2ae00ad4431b45a127710fdb8eff9467)
- One reference published after the fact: [0xb7e0b214…de74](https://explorer.arc.io/tx/0xb7e0b214e10048d94f09c10c616f2d2d0f7ae6c143766d501516d9bdc5d1de74)

**The memo is not the expensive part.** A memo-tagged payment inside a batch costs **0.88×** a plain transfer sent alone, anchor included. The whole seven-transaction demo cost the payer **0.018344 USDC** in fees.

---

## 8. How it compares

![How Tieout relates to existing tools](https://zhenyan1214.github.io/TallyPay/figures/table-11-comparison.png)

Tieout doesn't move money for you. It reconciles whatever wallet you point it at, however the payments were sent: through its batch builder, a payout provider, a Safe, or by hand.

**Prior art.** Tieout brings to Arc the patterns that production payment systems already rely on:

![Patterns brought to Arc from production payment systems](https://zhenyan1214.github.io/TallyPay/figures/table-12-prior-art.png)

Arc's `Memo` is richer than all of these mechanisms: arbitrary bytes, a separate indexed key, and `callDataHash` binding to one exact call.

---

## 9. What we learned building on Arc

These are offered as feedback for the Arc docs and for the next builder:

1. **`Memo` nests inside `Multicall3From.aggregate3`** with correct attribution. Both the memo `sender` and the transfer `from` are the paying EOA. The docs cover each contract separately; the combination is what makes memo-tagged batches possible.
2. **Every ERC-20 USDC transfer emits two `Transfer` logs** (one from `0x3600…` with 6 decimals, one from the EIP-7708 emitter `0xffff…fffe` with 18 decimals). A native send emits only the second.
   - An indexer that reads only the token contract misses every plain wallet send.
   - One that reads both without deduplicating double counts.
3. **Memos on incoming money are signed by the payer**, so a sender-filtered memo scan misses them. Tieout reads them from the receipts of incoming transfers instead. Found on the first mainnet run and fixed the same day.
4. **A roll-forward in micro-dollars can be off by one unit**, because fees are charged in 18 decimals while the ERC-20 view has 6. Tieout rolls forward in wei, and it ties exactly.
5. **The Memo blog and tutorial still say "testnet"**, but both contracts are live on mainnet at the documented addresses.
6. **Public RPC limits.** Public RPCs cap `eth_getLogs` at about 10,000 blocks and rate-limit bursts. A `maxFeePerGas` below 20 gwei is dropped silently, with no error.
7. **`memoData` has no defined format.** `tp1` is one answer. A canonical schema from Arc would let every indexer and accounting tool on the chain agree.

---

## 10. Limitations, stated plainly

- **`Memo` is EOA-only.** Safe and MPC payments start at `matched_by_intent` until somebody publishes a reference. When the pairing isn't unique, Tieout holds the payment rather than guessing.
- **Intent matching is basic.** It doesn't yet use due dates, tolerances or instalments.
- **Browser scans are capped at 200,000 blocks.** Longer periods need an indexer; Goldsky, The Graph and Envio all support Arc.
- **The double-payment guard is client-side.** The pre-send anchor check lowers the risk of paying a run twice but is not an on-chain guarantee. Any second settlement is still reported as a `duplicate`.
- **The Xero and QuickBooks files follow the vendors' published layouts** but haven't been imported into a live organisation yet. Journal entries are templates for an accountant, not accounting advice.
- **This is a proof of concept with no backend by design.** An enterprise deployment would add an indexer, ERP APIs and roles. The engine is a pure function, so those layers can be added around it unchanged.

---

## 11. Roadmap and use of the microgrant

![Roadmap](https://zhenyan1214.github.io/TallyPay/figures/table-13-roadmap.png)

The microgrant pays for mainnet testing, an indexer for longer scans, and the first payout-provider integration. That integration is the step from a working demo to real money being reconciled.

---

## 12. Links

- **Live app:** https://zhenyan1214.github.io/TallyPay/
- **Repository:** https://github.com/ZhenYan1214/TallyPay
- **Architecture:** [docs/ARCHITECTURE.md](https://github.com/ZhenYan1214/TallyPay/blob/main/docs/ARCHITECTURE.md)
- **Memo spec (`tp1`):** [docs/MEMO_SPEC.md](https://github.com/ZhenYan1214/TallyPay/blob/main/docs/MEMO_SPEC.md)
- **Integration guide:** [docs/INTEGRATION.md](https://github.com/ZhenYan1214/TallyPay/blob/main/docs/INTEGRATION.md)
- **Mainnet batch:** https://explorer.arc.io/tx/0x252dd1ff0f0ad77cb2d9fde109cd96de409521d52fbd662e4a9907eed684379e

*Tieout is an independent open-source project built on Arc and is not affiliated with Circle. "Tie-out" is what accountants call matching a balance to its source records.*

