# Tieout

**The reconciliation layer for USDC on Arc.** Tieout matches every USDC payment and receipt on Arc to the ledger entry it settles, flags what doesn't match, rolls the wallet balance forward against the chain, and turns the rest into journal entries an accountant can import.

| | |
|---|---|
| **Live app** | _TODO: GitHub Pages URL_ |
| **Mainnet demo run** | _TODO: explorer link to the PromptBazaar batch on Arc mainnet_ |
| **Memo spec** | [docs/MEMO_SPEC.md](docs/MEMO_SPEC.md), a proposal for an Arc-wide payment memo convention |
| **Architecture** | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): evidence grades, trust boundaries, what is deliberately left out |
| **Built on** | Arc's predeployed `Memo` and `Multicall3From`, both verified deployed on mainnet. No custom contracts, no backend, no keys on a server. |

> USDC settles in under a second. Books still take weeks. Payment rails for stablecoins are crowded; what happens after the money lands is not.

## Try it in 60 seconds

1. Open the live app and click **Run the PromptBazaar demo**. It scans Arc mainnet from your browser and reconciles a real payout run and two invoices: 9 payouts matched, 1 matched without a memo, 1 edited after payment, 1 never paid, 1 unexplained outflow, 1 invoice paid with a memo, 1 invoice still open, 1 unexplained receipt. Every row links to the explorer. The balance roll-forward at the top reads "fully explained".
2. Open **Verify**, click **Use a demo payment**, then **Look up**. The payment is found from its `EndToEndId` alone, no transaction hash, through Arc's indexed `memoId`.
3. Open **Pay a run → Request a payment**, fill in an amount, copy the link, open it. The payer's side is prefilled with your invoice id; when they pay, the receipt reconciles itself.
4. Open **Journal entries** and **Export** to see the double-entry template, the Xero and QuickBooks import files, and the ISO 20022 camt.054 notification.

If a public RPC is down, the demo falls back to a snapshot of the same block range and says so; the explorer links stay live.

## The problem

Paying in USDC is solved. Recording it is not.

- Finance teams match transaction hashes to invoices by hand. Spreadsheets break at a few dozen payouts a month, and "which invoice is this USDC payment for" is the question nobody can answer from an ERC-20 `Transfer` log.
- In an EY-Parthenon survey of 350 corporate and financial-institution decision makers, **70% would be more inclined to adopt stablecoins if ERP integrations were available**, and 38% cite accounting and tax treatment as a barrier ([EY, Sept 2025](https://www.ey.com/en_us/insights/financial-services/cost-savings-and-speed-drive-stablecoin-adoption)). Among US middle-market CFOs, ~40% cite integration with existing financial systems, and 88% convert stablecoin receipts to dollars immediately: it is a settlement rail that has to reconcile to fiat books ([PYMNTS, Mar 2026](https://www.pymnts.com/study_posts/waiting-for-certainty-why-most-cfos-are-holding-back-on-crypto-and-stablecoins/)).
- Real stablecoin payments reached about **$390B in 2025, 58% of it B2B** ([McKinsey × Artemis, Feb 2026](https://www.mckinsey.com/industries/financial-services/our-insights/stablecoins-in-payments-what-the-raw-transaction-numbers-miss)). B2B money lands in somebody's accounts payable or receivable.
- Circle's own position is that stablecoins are an additive rail, with the ERP or treasury system "holding the audit and accounting position" ([Circle, June 2026](https://www.circle.com/current/stablecoins-are-an-additive-rail)). Arc's Treasury blueprint names the gap: "reconciliation can require multiple teams and systems" ([Arc, Apr 2026](https://www.arc.io/blog/how-arc-supports-treasury-management-arc-blueprints)).
- The tools that automate this (Bitwave, Cryptio) are quote-priced enterprise subledgers that do not list Arc. The Arc-native payout tools that exist stop at the receipt and say so. Nothing on Arc produces a journal entry.

Arc is unusually well suited to fix this: memos live in the same transaction as the transfer, batches keep the payer as `msg.sender`, gas is paid in dollars, finality is deterministic, and every native value movement leaves a log. Arc describes its memos as being for "stablecoin payment reconciliation" and "batch payouts and disbursements" ([Arc, June 2026](https://community.arc.io/home/blogs/arc-transaction-memos-structured-transaction-context-for-financial-workflows-on-arc-2026-06-18)). Tieout is the layer that turns those properties into books.

## What it does

| Step | How |
|---|---|
| **Tag** | Each payment carries an ISO 20022-style memo (`EndToEndId`, `PmtInfId`, `Purp`, `CdtrRef`) through Arc's predeployed `Memo` contract. |
| **Batch and anchor** | A payout run is one transaction through Arc's `Multicall3From`. Its first call anchors a hash of the ledger (`NbOfTxs`, `CtrlSum`, `LedgerHash`), so edits made after payment are detectable. The anchor is also the run's idempotency key: a run that was already anchored by this wallet is refused before it can pay anyone twice. |
| **Request** | A payee builds a payment request link carrying its invoice id. The payer opens it, the memo carries the id, and the receipt matches the invoice without anyone exchanging a transaction hash. |
| **Reconcile** | Reads the wallet's activity from any public Arc RPC, in both directions, including native USDC sends that only appear in Arc's EIP-7708 system log. Matches with three grades of evidence: the memo in the transaction, a reference published afterwards, or counterparty + token + amount when the pairing is unique. Ambiguous pairings are held for a person, never guessed. Several ledgers (a month of payout runs plus the invoices) reconcile in one pass; the range can be given as dates. |
| **Attest** | For payments a Safe, custodian or plain wallet send made without a memo, any trusted EOA can publish an on-chain reference afterwards. It names the transaction and the EndToEndId and shares the payment's memoId, so from then on the payment is findable by id and reconciles as first-class evidence. |
| **Verify** | Finds any payment from its `EndToEndId` alone via the indexed `memoId` topic, and proves the memo belongs to that exact transfer through `callDataHash`. |
| **Book** | Matched payouts and receipts become balanced journal entries; exceptions go to suspense; the wallet balance is rolled forward against the chain. Exports: audit bundle (ledgers + chain scan + every decision, re-runnable by anyone), review CSV, generic journal CSV, Xero manual-journal import, QuickBooks Online journal import, ISO 20022 camt.054 XML. |

Every ledger entry and every transfer ends up in exactly one bucket:

| Status | Meaning |
|---|---|
| `matched` | Memo or trusted reference, counterparty, amount, token and direction agree with the ledger. |
| `matched_by_intent` | No memo, but counterparty, token and amount match exactly one open entry, and that entry fits no other transfer. |
| `mismatch` | The memo or reference points to an entry, but the details differ. Short- and over-payments show the exact difference. |
| `ambiguous` | No memo and more than one way to pair. Candidates are listed, money is held in suspense, nothing is guessed. |
| `missing` | The ledger expects a payment or receipt that never happened. |
| `duplicate` | The same entry was settled twice. |
| `unexpected` | Money moved with no ledger entry, in either direction. |

Two further checks run on top: the **run anchor** reports which entries were edited after anchoring (e.g. `PB-202610-ELLE-S04 edited after anchoring (amount 0.15 → 0.135)`), and the **balance roll-forward** checks that opening balance + receipts − payments − fees equals the on-chain closing balance for each token, so nothing the scan missed can stay hidden.

## The PromptBazaar demo

PromptBazaar is a fictional AI-prompt marketplace paying 12 sellers in 12 countries and invoicing two of them for premium listings. The marketplace is simulated; **the transactions are real Arc transactions**, with small amounts to keep the demo cheap. The scenario deliberately includes the things that go wrong in practice:

| Case | What happens | Expected result |
|---|---|---|
| 10 sellers | Paid in one batch with memos and an anchor | `matched` |
| Seller 07 | Paid by a plain ERC-20 transfer with no memo, as a Safe would | `matched_by_intent` |
| Seller 11 | Paid the same way, then the operations wallet published an on-chain reference for that transaction | `matched`, evidence `reference` |
| Seller 12 | On hold, never paid | `missing` |
| Seller 04 | Amount edited in the ledger after payment | `mismatch`, and the anchor pinpoints the edit |
| (none) | Treasury sends funds to an address the ledger doesn't know | `unexpected` (out) |
| Seller 09 | Pays PromptBazaar's invoice from their own wallet, with a memo | `matched` (in) |
| Seller 05 | Invoiced, has not paid | `missing` (in) |
| Seller 03 | Sends a tip with a plain wallet send: native USDC, no memo, no invoice | `unexpected` (in), flagged as a native send |

The app shows this table next to the results, with a link to the real transaction behind each case. (The reference case and the three money-in cases were added to the scenario script after the testnet run shown in the repo; they appear once the demo is run again, which the mainnet run does.)

## What it costs on Arc

Measured from receipts with `npm run gas` (Arc testnet, 21 gwei):

| Transaction | What it carried | Gas used | Fee (USDC) | Per payment (USDC) |
|---|---|---:|---:|---:|
| [0x1bafdd8c…8223](https://explorer.testnet.arc.io/tx/0x1bafdd8cd30f3ec603c6402f64eb0b21242ca71d12fcf11c31694b3d69388223) | batch: 10 memo payments + anchor | 642,626 | 0.013495 | 0.001350 |
| [0x0a956504…a677](https://explorer.testnet.arc.io/tx/0x0a956504ca24596100442f995ab573775df9eda6222d1dd92f5167da6e19a677) | plain transfer, no memo | 73,950 | 0.001553 | 0.001553 |

A memo-tagged payment inside a batch costs **0.87×** a plain transfer sent on its own, anchor included. The memo is not the expensive part; the per-transaction base cost is, and batching removes it.

_TODO after the mainnet run: replace with `npm run gas -- apps/web/public/demo/promptbazaar-arc-mainnet.json`._

## Memo format (`tp1`)

Memos are UTF-8 JSON with a prefix, passed as `memoData` to Arc's `Memo.memo(target, data, memoId, memoData)`. Full spec: [docs/MEMO_SPEC.md](docs/MEMO_SPEC.md).

```text
tp1:{"EndToEndId":"PB-202610-ELLE-S04","PmtInfId":"PB-202610-ELLE","Purp":"COMM","CdtrRef":"STMT-202610-S04"}
tp1-run:{"PmtInfId":"PB-202610-ELLE","NbOfTxs":10,"CtrlSum":"1.367","LedgerHash":"0x…"}
```

- Field names and limits follow ISO 20022 (`Max35Text` identifiers, 4-letter `ExternalPurpose1Code`, `Max140Text` remittance info), so bank-side systems map them without translation, and the camt.054 export carries them as-is.
- `memoId = keccak256("tp1:" + EndToEndId)`. Anyone holding the ledger can query a payment's memo log directly by its indexed `memoId`.
- Whoever keeps the books allocates `EndToEndId`: the payer for payouts, the payee for invoices (through a payment request link).
- `LedgerHash` is `keccak256` over the sorted lines `EndToEndId|recipient|amountUnits|token`. It commits to the payments without revealing them.
- The anchor memo wraps a zero-value `transfer(payer, 0)`, because `Memo` needs an inner call to wrap. It moves nothing and the reader filters it out.
- **Memos are public and permanent.** They carry identifiers only. Payee names and other personal data stay in the payer's own ledger and are never written on-chain.

This is a proposal, not an official Arc standard. If Arc publishes a canonical memo schema, the SDK should adopt it.

## How a memo is tied to its transfer

Inside a batch, each `Memo` event records `callDataHash = keccak256(data)` of the call it wrapped. Tieout recomputes `keccak256(transfer(to, value))` for every observed USDC `Transfer` and links it to the memo in the same transaction with the same target and hash. This works for any number of payments per transaction, and it is what the Verify page shows on screen. Finding a memo is not validating a payment: the reconciler still checks counterparty, token, amount and direction, and settles each id at most once.

## Three grades of evidence

| Grade | Link | Produced by |
|---|---|---|
| **memo** | `Memo` event in the same transaction, bound by `callDataHash` | The payer, when paying (EOA only on Arc) |
| **reference** | `tp1-ref` memo published later by a trusted EOA, naming the transaction and the EndToEndId | Whoever the ledger owner trusts: an ops wallet attesting a Safe's payouts, a custodian's signer, the payee |
| **intent** | Counterparty, token and amount agree and the pairing is unique both ways | Inferred; weakest, and the only grade that can be `ambiguous` |

The reconciler always tries the stronger grade first, labels every settled item with the grade that settled it, and the Reconcile page offers to publish references for anything that only matched by intent. Arc's `Memo` is EOA-only; references are how payments from Safes, custodians and exchanges get the same evidence as payments from an EOA. Details in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Precedents on other chains

Tieout does not invent the pattern; it brings to Arc what the payment systems that work in production already rely on.

| System | Mechanism | What Tieout takes from it |
|---|---|---|
| **Stellar** | Transaction memos; [SEP-29](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0029.md) `memo_required`; [SEP-31](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0031.md) where the receiver allocates the memo | Identifier in the transaction; receiver-allocated ids for receivables |
| **Solana Pay** | [Reference keys](https://docs.solanapay.com/spec) indexed by validators, found with `getSignaturesForAddress`, then `validateTransfer` | `memoId` is the index; Verify is `findReference`; find and validate are separate steps |
| **Tempo** (Stripe / Paradigm) | TIP-20 `transferWithMemo` with an indexed 32-byte memo; [Goldsky's reconciliation pipeline](https://docs.goldsky.com/solutions/real-time-reconciliation) keyed on it | The deterministic join and the "nothing silent" rule; the double-log pitfall |
| **Request Network** | Salted `paymentReference` emitted by a proxy, balance = sum of payments per reference | The salted-id variant reserved in the spec; instalments reserved |
| **Modern Treasury** | Expected payments, 1:1 / 1:many / many:1 rules, amount variance, manual review on ambiguity | Variance reporting; intent matching only when exactly one candidate |
| **Banking** | ISO 20022 `pain.001` / `camt.054`: `EndToEndId`, `PmtInfId`, `Purp`, `CdtrRef`, `NbOfTxs`, `CtrlSum`; Circle Mint delivers `camt.053` statements | Field names and limits; the camt.054 export |

Arc's `Memo` is richer than the chain mechanisms above: the memo is arbitrary bytes, the lookup key is a separate indexed field, and `callDataHash` binds the memo to one exact inner call.

## How this differs from existing tools

| | Covers | Arc | Where Tieout sits |
|---|---|---|---|
| Circle Mint statements (camt.053) | Mint account activity | yes | Tieout reconciles any wallet and emits the sibling camt.054 for it; they compose |
| Bitwave, Cryptio | Multi-chain crypto accounting, DeFi, impairment | not listed | Single chain, single asset, open source; the hard parts of crypto accounting mostly vanish on Arc |
| Request Finance, Coinbase Business | Invoicing plus payment, accounting sync | no | Payment-side; Tieout is payment-agnostic and complements them |
| Arc-native payout batchers | Sending batched USDC with references | yes | They stop at the receipt; Tieout starts there: both directions, exceptions, roll-forward, journals |

Tieout doesn't move money for you. It reconciles whatever wallet you point it at, whether payouts were sent through Tieout's batch builder, a payouts provider, a Safe, or by hand, and whether money went out to payees or came in against invoices.

## Design decisions a reviewer will ask about

**Why no custom contract?** Arc ships `Memo` and `Multicall3From` at genesis. Reimplementing them would add audit surface and prove nothing. Using them well is the point.

**Why no backend?** Arc's public RPCs allow CORS, so the browser reads the chain directly. The ledger, with payee names in it, never leaves the user's machine. There is nothing to breach.

**Why both directions?** B2B is the largest slice of real stablecoin payments, and "which invoice does this receipt settle" is the receivables version of the same problem. The engine treats a receivable as an entry with `direction: "in"`; the payment request link lets the payee put its id into the payer's memo.

**Why read the EIP-7708 system log?** Because a wallet's plain "send" of USDC is a native value transfer that never touches the ERC-20 contract. An indexer that reads only `0x3600…` misses it. Tieout reads both logs and drops the system one when the ERC-20 twin is present.

**Why JSON memos and not ABI encoding?** Legible on explorers and in audit files, decodable without tooling, keys map one-to-one to ISO 20022. The cost is negligible next to the per-transaction base fee (see the gas table). The spec reserves a `tp2:` prefix for a binary encoding if that ever changes.

**Won't a deterministic memoId let anyone enumerate my payments?** Anyone who knows an id can find that payment, which is the feature for payees and auditors. The spec reserves a salted variant for payers who need unlinkability.

**Why a zero-value self-transfer for the anchor?** `Memo` needs an inner call to wrap. A `transfer(payer, 0)` is the cheapest harmless one. It is filtered out of every report.

**What about Safe and MPC wallets?** `Memo` is EOA-only on Arc today. Tieout first falls back to matching on counterparty, token and amount, labelled `matched_by_intent` so an accountant knows the evidence is weaker, and refuses to guess when the pairing is not unique. Then any trusted EOA can publish on-chain references for those payments, after which they reconcile as `matched` and are findable by id. Arc's docs suggest exactly this "separate EOA-signed memo transaction" as the workaround; Tieout gives it a schema and a button.

**Why can't it just pick the oldest candidate when two pairings are possible?** Because an accountant would then be signing off on a guess. Modern Treasury, the best-documented commercial matcher, routes multiple candidates to manual review; so does Tieout. The held money sits in suspense and the roll-forward still ties.

**Why does the anchor only cover its own transaction?** Runs get split: some entries are held back, some are paid separately. The anchor commits to what was actually paid in that transaction, recovered from the memos in it, so a held entry does not produce a false "ledger tampered" alarm.

**Is the accounting correct?** Entries are templates for an accountant, and every page says so. Account codes are configurable. Stablecoin classification is still moving (FASB proposed in August 2026 that qualifying stablecoins could be cash equivalents, comments due November), which is exactly why the output is a reviewable journal, and why the roll-forward reports balances per token.

## Findings from building on Arc

Verified with real testnet transactions ([example](https://explorer.testnet.arc.io/tx/0xd1033e597ec4ef74b1118356d6a14dcc61fcb09d0ad34fdec0ef3a7d8baf1865)) and read-only mainnet checks. Offered as feedback for the Arc docs and the next builder:

- `Memo` calls nested inside `Multicall3From.aggregate3` work, and both the `Memo` event's `sender` and the USDC `Transfer`'s `from` are the paying EOA. The docs cover each contract separately; the combination is what makes memo'd batches possible.
- Each ERC-20 USDC transfer emits **two** `Transfer` logs: one from the USDC contract `0x3600…` (6 decimals) and one from the EIP-7708 system emitter `0xffff…fffe` (18 decimals). A native value send emits **only** the second. An indexer that reads the token contract alone double counts nothing but misses every plain wallet send; one that reads both without deduplicating double counts every ERC-20 transfer. On one demo wallet, 10 of 14 receipts over a day were native sends.
- `Memo` and `Multicall3From` are deployed at the documented addresses on mainnet (checked 2026-10-13 via `eth_getCode`), although the Memo blog and tutorial still say "testnet".
- Public RPCs cap `eth_getLogs` at about 10,000 blocks, so scans are chunked at 9,000, and they return HTTP 429 on bursts of parallel requests, so the reader keeps at most two in flight. Mainnet produces roughly two blocks per second.
- Public RPCs do serve historical `balanceOf` at a block number, which is what makes the balance roll-forward possible without an archive node.
- `maxFeePerGas` below 20 gwei is dropped silently, with no error from the RPC.
- Public RPCs do not expose `debug_traceCall` or `eth_simulateV1`; event shapes had to be confirmed with real transactions.
- A memo-tagged payment inside a batch is cheaper than a plain transfer sent alone (0.87×), because the batch amortises the base cost.
- The Memo tutorial encodes `memoData` as a plain string and leaves the format to the application. `tp1` is one answer; a canonical schema from Arc would let every indexer and accounting tool on the chain agree.

## Architecture

```
packages/sdk     @tieout/sdk    networks, ABIs, memo codec, ledger hashing, batch builder, log reader (ERC-20 + EIP-7708), memoId lookup, snapshots
packages/recon   @tieout/recon  reconciliation engine (both directions, variance, roll-forward), anchor check, journal builder, CSV / Xero / QBO / camt.054
apps/web         @tieout/web    static React app: Overview, Reconcile, Verify, Pay a run, Request a payment
scripts/                          CLI: spike, PromptBazaar scenario, reconcile, gas report, snapshot, sweep
docs/                             memo spec, submission kit, research notes (zh-TW), project plan (zh-TW)
```

- **No backend and no keys on a server.** The web app reads Arc directly from the browser. Payouts are signed by the user's own wallet (EIP-1193).
- **No custom contracts.** Payments go through Arc's predeployed `Memo` (`0x5294…e505`) and `Multicall3From` (`0x522f…47D0`).
- 38 unit tests cover the memo codec, batching, reference memos, memo-to-transfer linking, snapshots, reconciliation in both directions with all three evidence grades, ambiguity, variance, roll-forward, journals and every export. CI runs typecheck, tests and the production build on every push.

## Run it

Requirements: Node.js 20+.

```bash
npm install
npm run typecheck
npm test
npm run dev --workspace @tieout/web
```

Read-only scripts need no key:

```bash
npm run reconcile -- apps/web/public/demo/promptbazaar-arc-testnet.json --out=reports/testnet   # CSVs, QBO, camt.054
npm run gas -- apps/web/public/demo/promptbazaar-arc-testnet.json        # cost table from receipts
npm run snapshot -- apps/web/public/demo/promptbazaar-arc-testnet.json   # freeze the scan for the web demo
```

Scripts that send transactions need a funded wallet in `.env` (see `.env.example`). Use a dedicated wallet that holds only a few USDC:

```bash
npm run spike                                   # testnet: batch of memo transfers, prints every log
npm run demo -- --network=arc-testnet           # PromptBazaar scenario; writes apps/web/public/demo/*.json
npm run sweep -- --network=arc-testnet          # send demo funds back to the payer
```

Demo recipients are derived from the payer key, so demo funds can always be swept back.

### Ledger file format

CSV columns: `EndToEndId, direction, recipient, payer, amount, token, Purp, CdtrRef, Ustrd, payeeName, payeeCountry`. `direction` is `out` (default) or `in`; for `in`, `recipient` is your own wallet and `payer` is the expected sender (optional). JSON uses the same fields under `instructions`, plus `PmtInfId`, `network`, `payer` and an optional `scan` block range.

## Mainnet checklist

The demo is network-agnostic. To put it on mainnet:

```bash
# .env: MAINNET_PRIVATE_KEY=…  (wallet holding ≥ 2 USDC on Arc mainnet)
npm run demo -- --network=arc-mainnet
npm run snapshot -- apps/web/public/demo/promptbazaar-arc-mainnet.json
npm run gas -- apps/web/public/demo/promptbazaar-arc-mainnet.json
```

Then fill in the two links at the top of this file, commit the two new files under `apps/web/public/demo/`, and push. The web app prefers the mainnet demo automatically when it is present. [docs/SUBMISSION.md](docs/SUBMISSION.md) has the full pre-flight list.

## Accounting notes

Journal entries are **templates for review by an accountant, not accounting or tax advice.**

- Cleared payouts: debit *Payouts payable*, credit *USDC wallet (Arc)*. Cleared receipts: debit *USDC wallet (Arc)*, credit *Receivables (USDC invoices)*. Exceptions: the wallet side stays true to the chain and the other side goes to *Suspense* until resolved.
- Network fees are paid in USDC and booked as a USD expense, once per day, because individual fees are fractions of a cent.
- Account codes and names are configurable (`ChartOfAccounts`).
- The Xero export follows the "Import manual journals" layout (`*Narration, *Date, Description, *AccountCode, *TaxRate, *Amount, TrackingName1, TrackingOption1`; positive amounts are debits, negative are credits), includes USDC lines only, and rounds each line's magnitude half-up to cents so debits and credits stay equal. Xero does not accept bank accounts or system accounts (AP/AR) in manual journals: set the USDC wallet up as a **Current Asset**, *Payouts payable* as a **Current Liability** and *Receivables (USDC invoices)* as a **Current Asset**, then map their codes.
- The QuickBooks Online export follows the "Import journal entries" layout (`*JournalNo, *JournalDate, *AccountName, Debits, Credits, Description, Name, Currency`): account **names**, US dates, the transaction hash in the description because QBO has no hash field.
- The camt.054 export is a draft notification: USDC is reported as `USD` and EURC as `EUR`, with the token and network in the proprietary bank transaction code. Validate it against your TMS before relying on it.

## Limitations

- Arc's `Memo` requires an EOA caller. Smart-contract wallets fall back to intent matching, which is weaker when several open entries share the same counterparty and amount; the reconciler leaves ambiguous cases unmatched rather than guessing.
- Intent matching only settles unique pairings; it does not yet use invoice due dates, amount tolerances or instalments, so a run with several identical payouts to one address needs memos or references to resolve.
- EURC is supported by the SDK and the reconciler, but journal export needs a recorded FX rate before EURC lines can be booked in a USD ledger.
- Browser scans are limited to 200,000 blocks per run. Longer periods need an indexer (Goldsky, The Graph and Envio support Arc).
- Native USDC amounts below one millionth are floored; the exact 18-decimal figure is kept on the observation.
- The Pay page sends from a browser wallet (EOA). It demonstrates the batch builder; a Safe-based payer would use the SDK's `buildPayoutRun` output through its own signing flow and still reconcile here.

## Roadmap

- Webhook ingestion from payout providers on Arc, so their runs reconcile automatically without changing how they pay
- Direct sync to Xero and QuickBooks via OAuth, beyond CSV import
- Salted memoId variant, refund references (`RtrRef`) and instalments (`InstlmtNb`) as specified in `tp1.1`
- EURC and local stablecoins with FX rates recorded at settlement
- View-key audits once Arc's opt-in privacy ships: an auditor could verify a run without the ledger becoming public
- Propose `tp1` (or its successor) to the Arc team as a shared memo convention

## License

Apache-2.0. Tieout is an independent open-source project built on Arc and is not affiliated with Circle. "Tie-out" is what accountants call matching a balance to its source records.

---

## 中文簡介

Tieout 是 Arc 上的對帳層：把 Arc 上每一筆 USDC 付款與收款對到帳本上的那一筆，抓出異常，用鏈上餘額滾算確認沒有漏掉任何一塊錢，並把其餘的轉成會計師可以匯入的分錄。

- 只用 Arc 原生的 `Memo` 與 `Multicall3From`（主網已確認部署），沒有自訂合約、沒有後端、不保管任何私鑰
- 付出去與收進來都對：應付（付款批次）與應收（發票）同一個引擎；請款連結讓付款方的 Memo 自動帶上你的發票號
- 三種證據等級：交易裡的 Memo、事後由受信任的 EOA 發布的參考（解決 Safe、託管、交易所付款沒有 Memo 的問題）、唯一配對的意圖比對；配不唯一就標 ambiguous 交給人，絕不猜
- 同時讀 ERC-20 事件與 EIP-7708 系統事件，所以用 MetaMask 直接「Send」的原生 USDC 也看得到
- Memo 欄位採用 ISO 20022 命名，只放識別碼；格式規格見 `docs/MEMO_SPEC.md`；可匯出 Xero、QuickBooks 與 camt.054
- 帳本雜湊錨定在鏈上，事後竄改可精準抓出；錨點同時是批次的冪等鍵，重複送出的批次會被擋下
- Verify 頁只憑 `EndToEndId` 就能在鏈上找到那筆付款
- 實測：批次裡一筆帶 Memo 的付款，比單獨送一筆純轉帳還便宜
- PromptBazaar 是模擬的市集，但所有交易都是真實的 Arc 交易；研究背景見 `docs/RESEARCH.md`
