# Tallypay

**The reconciliation layer for USDC on Arc.** Tallypay matches every USDC payment on Arc to the ledger entry it pays, flags what doesn't match, and turns the rest into journal entries an accountant can import.

| | |
|---|---|
| **Live app** | _TODO: GitHub Pages URL_ |
| **Mainnet demo run** | _TODO: explorer link to the PromptBazaar batch on Arc mainnet_ |
| **Memo spec** | [docs/MEMO_SPEC.md](docs/MEMO_SPEC.md), a proposal for an Arc-wide payment memo convention |
| **Built on** | Arc's predeployed `Memo` and `Multicall3From`. No custom contracts, no backend, no keys on a server. |

> USDC settles in under a second. Books still take weeks. Payment rails for stablecoins are crowded; what happens after the money lands is not.

## Try it in 60 seconds

1. Open the live app and click **Run the PromptBazaar demo**. It scans Arc mainnet from your browser and reconciles a real payout run: 9 matched, 1 matched without a memo, 1 edited after payment, 1 never paid, 1 unexplained outflow. Every row links to the explorer.
2. Open **Verify**, click **Use a demo payment**, then **Look up**. The payment is found from its `EndToEndId` alone, no transaction hash, through Arc's indexed `memoId`.
3. Open **Journal entries** and **Export** to see the double-entry template and the Xero import file.

If a public RPC is down, the demo falls back to a snapshot of the same block range and says so; the explorer links stay live.

## The problem

Paying people in USDC is solved. Recording it is not.

- Finance teams match transaction hashes to invoices by hand. Spreadsheets break at a few dozen payouts a month.
- In an EY-Parthenon survey of 350 executives, **70% said ERP integration would speed up stablecoin adoption**, and 38% cited accounting and tax treatment as a barrier ([GDF readout, Q1 2026](https://www.gdf.io/wp-content/uploads/2026/06/Digital-Finance-Forum-Readout-Q1_2026.pdf)).
- Tools that automate this (Bitwave, Cryptio) are priced and built for enterprises with multi-chain DeFi portfolios. Payment-side tools that sync to accounting software don't support Arc.

Arc is unusually well suited to fix this: memos live in the same transaction as the transfer, batches keep the payer as `msg.sender`, gas is paid in dollars, and finality is deterministic. Tallypay wires those four properties into a ledger workflow.

## What it does

| Step | How |
|---|---|
| **Tag** | Each payment carries an ISO 20022-style memo (`EndToEndId`, `PmtInfId`, `Purp`, `CdtrRef`) through Arc's predeployed `Memo` contract. |
| **Batch and anchor** | A payout run is one transaction through Arc's `Multicall3From`. Its first call anchors a hash of the ledger (`NbOfTxs`, `CtrlSum`, `LedgerHash`), so edits made after payment are detectable. |
| **Reconcile** | Reads the wallet's activity from any public Arc RPC and matches it to the ledger: by memo when present, by recipient/token/amount when the payer used a wallet that can't attach memos (Safe, MPC custody). |
| **Verify** | Finds any payment from its `EndToEndId` alone via the indexed `memoId` topic, and proves the memo belongs to that exact transfer through `callDataHash`. |
| **Book** | Matched payouts become balanced journal entries; exceptions go to suspense. Exports a review CSV, a generic journal CSV, and a Xero manual-journal import file. |

Every ledger entry and every outgoing transfer ends up in exactly one bucket:

| Status | Meaning |
|---|---|
| `matched` | Memo, recipient, amount and token agree with the ledger. |
| `matched_by_intent` | No memo, but recipient, token and amount match an open entry. |
| `mismatch` | The memo points to an entry, but the details differ. |
| `missing` | The ledger expects a payment that never happened. |
| `duplicate` | The same entry was paid twice. |
| `unexpected` | Money left the wallet with no ledger entry. |

The run anchor is checked separately. It reports which specific entries were edited after anchoring, e.g. `PB-202610-ELLE-S04 edited after anchoring (amount 0.15 → 0.135)`.

## The PromptBazaar demo

PromptBazaar is a fictional AI-prompt marketplace paying 12 sellers in 12 countries. The marketplace is simulated; **the transactions are real Arc transactions**, with small amounts to keep the demo cheap. The scenario deliberately includes the things that go wrong in practice:

| Seller | What happens | Expected result |
|---|---|---|
| 10 sellers | Paid in one batch with memos and an anchor | `matched` |
| Seller 07 | Paid by a plain transfer with no memo, as a Safe would | `matched_by_intent` |
| Seller 12 | On hold, never paid | `missing` |
| Seller 04 | Amount edited in the ledger after payment | `mismatch`, and the anchor pinpoints the edit |
| (none) | Treasury sends funds to an address the ledger doesn't know | `unexpected` |

The app shows this table next to the results, with a link to the real transaction behind each case.

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

- Field names and limits follow ISO 20022 (`Max35Text` identifiers, 4-letter `ExternalPurpose1Code`, `Max140Text` remittance info), so bank-side systems can map them without translation.
- `memoId = keccak256("tp1:" + EndToEndId)`. Anyone holding the ledger can query a payment's memo log directly by its indexed `memoId`.
- `LedgerHash` is `keccak256` over the sorted lines `EndToEndId|recipient|amountUnits|token`. It commits to the payments without revealing them.
- The anchor memo wraps a zero-value `transfer(payer, 0)`, because `Memo` needs an inner call to wrap. It moves nothing and the reader filters it out.
- **Memos are public and permanent.** They carry identifiers only. Payee names and other personal data stay in the payer's own ledger and are never written on-chain.

This is a proposal, not an official Arc standard. If Arc publishes a canonical memo schema, the SDK should adopt it.

## How a memo is tied to its transfer

Inside a batch, each `Memo` event records `callDataHash = keccak256(data)` of the call it wrapped. Tallypay recomputes `keccak256(transfer(to, value))` for every observed USDC `Transfer` and links it to the memo in the same transaction with the same target and hash. This works for any number of payments per transaction, and it is what the Verify page shows on screen.

## Precedents on other chains

Tallypay does not invent the pattern; it brings to Arc what the payment chains that work in production already rely on.

| Chain | Mechanism | What it is used for | What Tallypay takes from it |
|---|---|---|---|
| **Stellar** | Transaction memos; [SEP-29](https://stellar.org/protocol/sep-29) lets an account declare `memo_required` | Exchanges route deposits to customers by memo; a missing memo means a support ticket | Identifier-in-the-transaction, not in a side database |
| **Solana** | [Solana Pay reference keys](https://docs.solanapay.com/spec): a 32-byte key included in the transfer, indexed by validators, found with `getSignaturesForAddress` | Merchants know the id before the payment exists and look the payment up by it | `memoId` is the index; Verify is `findReference` for Arc |
| **Tempo** (Stripe / Paradigm) | TIP-20 `transferWithMemo` with a 32-byte memo; [Goldsky documents a reconciliation pipeline](https://docs.goldsky.com/solutions/real-time-reconciliation) keyed on it | Deterministic join between on-chain settlements and an internal ledger, exceptions surfaced as they settle | The six-bucket output and the "nothing silent" rule |
| **Banking** | ISO 20022 `pain.001` / `camt.054`: `EndToEndId`, `PmtInfId`, `Purp`, `CdtrRef`, `NbOfTxs`, `CtrlSum` | Every bank credit transfer carries these; ERPs already speak them | Field names, limits and the run-level control totals |

Arc's `Memo` is richer than all three chain mechanisms: the memo is arbitrary bytes, the lookup key is a separate indexed field, and `callDataHash` binds the memo to one exact inner call. Tallypay is the first tool to use all three together.

## How this differs from existing tools

| | Covers | Arc | Price | Where Tallypay sits |
|---|---|---|---|---|
| Circle Mint payouts reports | Payouts sent through Circle Mint | yes | included | Tallypay reconciles any wallet, whoever sent the money |
| Bitwave, Cryptio | Multi-chain crypto accounting, DeFi, impairment | not yet | enterprise | Single chain, single asset, open source; the hard parts of crypto accounting mostly vanish on Arc |
| Request Finance, Coinbase Business | Invoicing plus payment, with accounting sync | no | SaaS | Payment-side; Tallypay is payment-agnostic and complements them |
| Goldsky reconciliation pipeline (Tempo) | Streaming join of memo'd transfers to a ledger | n/a | infra | Same idea; Tallypay runs client-side on Arc and adds anchoring, journals and Xero export |

Tallypay doesn't move money for you. It reconciles whatever wallet you point it at, whether payouts were sent through Tallypay's batch builder, a payouts provider, a Safe, or by hand.

## Design decisions a reviewer will ask about

**Why no custom contract?** Arc ships `Memo` and `Multicall3From` at genesis. Reimplementing them would add audit surface and prove nothing. Using them well is the point.

**Why no backend?** Arc's public RPCs allow CORS, so the browser reads the chain directly. The ledger, with payee names in it, never leaves the user's machine. There is nothing to breach.

**Why JSON memos and not ABI encoding?** Legible on explorers and in audit files, decodable without tooling, keys map one-to-one to ISO 20022. The cost is negligible next to the per-transaction base fee (see the gas table). The spec reserves a `tp2:` prefix for a binary encoding if that ever changes.

**Why a zero-value self-transfer for the anchor?** `Memo` needs an inner call to wrap. A `transfer(payer, 0)` is the cheapest harmless one. It is filtered out of every report.

**What about Safe and MPC wallets?** `Memo` is EOA-only on Arc today. Tallypay falls back to matching on recipient, token and amount, and labels those matches `matched_by_intent` so an accountant knows the evidence is weaker.

**Why does the anchor only cover its own transaction?** Runs get split: some entries are held back, some are paid separately. The anchor commits to what was actually paid in that transaction, recovered from the memos in it, so a held entry does not produce a false "ledger tampered" alarm.

**Is the accounting correct?** Entries are templates for an accountant, and every page says so. Account codes are configurable. Stablecoin classification is still moving (FASB proposed in August 2026 that qualifying stablecoins could be cash equivalents), which is exactly why the output is a reviewable journal and not a filed return.

## Findings from building on Arc

Verified with real testnet transactions ([example](https://explorer.testnet.arc.io/tx/0xd1033e597ec4ef74b1118356d6a14dcc61fcb09d0ad34fdec0ef3a7d8baf1865)). Offered as feedback for the Arc docs and the next builder:

- `Memo` calls nested inside `Multicall3From.aggregate3` work, and both the `Memo` event's `sender` and the USDC `Transfer`'s `from` are the paying EOA. The docs cover each contract separately; the combination is what makes memo'd batches possible.
- Each USDC transfer emits **two** `Transfer` logs: one from the USDC contract `0x3600…` (6 decimals) and one from the EIP-7708 system emitter `0xffff…fffe` (18 decimals). A naive indexer double counts. Tallypay reads only the token contract's log.
- Public RPCs cap `eth_getLogs` at about 10,000 blocks, so scans are chunked at 9,000. Mainnet produces roughly two blocks per second.
- `maxFeePerGas` below 20 gwei is dropped silently, with no error from the RPC.
- Public RPCs do not expose `debug_traceCall` or `eth_simulateV1`; event shapes had to be confirmed with real transactions.
- A memo-tagged payment inside a batch is cheaper than a plain transfer sent alone (0.87×), because the batch amortises the base cost.
- The Memo tutorial encodes `memoData` as a plain string and leaves the format to the application. `tp1` is one answer; a canonical schema from Arc would let every indexer and accounting tool on the chain agree.

## Architecture

```
packages/sdk     @tallypay/sdk    networks, ABIs, memo codec, ledger hashing, batch builder, log reader, memoId lookup, snapshots
packages/recon   @tallypay/recon  reconciliation engine, anchor check, journal builder, CSV/Xero export
apps/web         @tallypay/web    static React app: Overview, Reconcile, Verify, Pay a run
scripts/                          CLI: spike, PromptBazaar scenario, reconcile, gas report, snapshot, sweep
docs/                             memo spec, submission kit, project plan (zh-TW)
```

- **No backend and no keys on a server.** The web app reads Arc directly from the browser. Payouts are signed by the user's own wallet (EIP-1193).
- **No custom contracts.** Payments go through Arc's predeployed `Memo` (`0x5294…e505`) and `Multicall3From` (`0x522f…47D0`).
- 21 unit tests cover the memo codec, batching, memo-to-transfer linking, snapshots, reconciliation and journals. CI runs typecheck, tests and the production build on every push.

## Run it

Requirements: Node.js 20+.

```bash
npm install
npm run typecheck
npm test
npm run dev --workspace @tallypay/web
```

Read-only scripts need no key:

```bash
npm run reconcile -- apps/web/public/demo/promptbazaar-arc-testnet.json --out=reports/testnet
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

- Cleared payouts: debit *Payouts payable*, credit *USDC wallet (Arc)*. Exceptions: debit *Suspense* until resolved.
- Network fees are paid in USDC and booked as a USD expense, once per day, because individual fees are fractions of a cent.
- Account codes are configurable (`ChartOfAccounts`).
- The Xero export follows the "Import manual journals" layout (`*Narration, *Date, Description, *AccountCode, *TaxRate, *Amount, TrackingName1, TrackingOption1`; positive amounts are debits, negative are credits), includes USDC lines only, and rounds each line's magnitude half-up to cents so debits and credits stay equal. Check the headers against the template downloaded from your own Xero organisation.
- Xero does not accept bank accounts or system accounts (Accounts Payable/Receivable) in manual journals. Set up the USDC wallet as a **Current Asset** account and *Payouts payable* as an ordinary **Current Liability** account, then map their codes in `ChartOfAccounts`.

## Limitations

- Arc's `Memo` requires an EOA caller. Smart-contract wallets fall back to intent matching, which is weaker when several open entries share the same recipient and amount.
- Intent matching pairs entries with transfers oldest-first; it does not yet use invoice due dates.
- EURC is supported by the SDK and the reconciler, but journal export needs a recorded FX rate before EURC lines can be booked in a USD ledger.
- Browser scans are limited to 200,000 blocks per run. Longer periods need an indexer (Goldsky, The Graph and Envio support Arc).
- The Pay page sends from a browser wallet (EOA). It is a demonstration of the batch builder, not a treasury product; a Safe-based payer would use the SDK's `buildPayoutRun` output through its own signing flow and still reconcile here.

## Roadmap

- Direct sync to Xero and QuickBooks via OAuth, beyond CSV import
- Webhook ingestion from payout providers on Arc, so their runs reconcile automatically without changing how they pay
- EURC and local stablecoins with FX rates recorded at settlement
- View-key audits once Arc's opt-in privacy ships: an auditor could verify a run without the ledger becoming public
- Propose `tp1` (or its successor) to the Arc team as a shared memo convention

## License

Apache-2.0. Tallypay is an independent open-source project built on Arc and is not affiliated with Circle.

---

## 中文簡介

Tallypay 是 Arc 上的對帳層：把 Arc 上每一筆 USDC 付款對到帳本上的那一筆，抓出異常，並把其餘的轉成會計師可以匯入的分錄。

- 只用 Arc 原生的 `Memo` 與 `Multicall3From`，沒有自訂合約、沒有後端、不保管任何私鑰
- Memo 欄位採用 ISO 20022 命名，只放識別碼，不放個人資料；格式規格見 `docs/MEMO_SPEC.md`
- 帳本雜湊錨定在鏈上，事後竄改帳本可以精準抓出是哪一筆
- 沒有 Memo 的錢包（Safe、MPC）也能依「收款人、金額、幣種」比對
- Verify 頁只憑帳本上的 `EndToEndId` 就能在鏈上找到那筆付款，不需要交易雜湊
- 實測：批次裡一筆帶 Memo 的付款，比單獨送一筆純轉帳還便宜
- PromptBazaar 是模擬的市集，但所有交易都是真實的 Arc 交易
