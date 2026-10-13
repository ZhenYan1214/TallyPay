# Tallypay

**A reconciliation layer for USDC on Arc.** Tallypay matches every USDC payment on Arc to the ledger entry it pays, flags what doesn't match, and turns the rest into journal entries an accountant can import.

- **Live app:** _add deployment URL_
- **Mainnet demo run:** _add Arc explorer link_
- Built entirely on Arc's native primitives (Memo, Multicall3From). No custom contracts.

> USDC settles in under a second. Books still take weeks. Payment rails for stablecoins are crowded; what happens after the money lands is not.

---

## The problem

Paying people in USDC is solved. Recording it is not.

- Finance teams match transaction hashes to invoices by hand. Spreadsheets break at a few dozen payouts a month.
- In an EY-Parthenon survey of 350 executives, **70% said ERP integration would speed up stablecoin adoption**, and 38% cited accounting and tax treatment as a barrier ([GDF readout, Q1 2026](https://www.gdf.io/wp-content/uploads/2026/06/Digital-Finance-Forum-Readout-Q1_2026.pdf)).
- Tools that automate this (Bitwave, Cryptio) are priced and built for enterprises with multi-chain DeFi portfolios. Payment-side tools that sync to accounting software don't support Arc.

Arc is unusually well suited to fix this: memos live in the same transaction as the transfer, batches keep the payer as `msg.sender`, gas is paid in dollars, and finality is deterministic. Tallypay wires those primitives into a ledger workflow.

## What it does

| Step | How |
|---|---|
| **Tag** | Each payment carries an ISO 20022-style memo (`EndToEndId`, `PmtInfId`, `Purp`, `CdtrRef`) through Arc's predeployed `Memo` contract. |
| **Batch and anchor** | A payout run is one transaction through Arc's `Multicall3From`. Its first call anchors a hash of the ledger (`NbOfTxs`, `CtrlSum`, `LedgerHash`), so edits made after payment are detectable. |
| **Reconcile** | Reads the wallet's activity from any public Arc RPC and matches it to the ledger: by memo when present, by recipient/token/amount when the payer used a wallet that can't attach memos (Safe, MPC custody). |
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

Open the app, go to **Reconcile**, and click **Load PromptBazaar demo**.

## Memo format (`tp1`)

Memos are UTF-8 JSON with a prefix, passed as `memoData` to Arc's `Memo.memo(target, data, memoId, memoData)`.

```text
tp1:{"EndToEndId":"PB-202610-ELLE-S04","PmtInfId":"PB-202610-ELLE","Purp":"COMM","CdtrRef":"STMT-202610-S04"}
tp1-run:{"PmtInfId":"PB-202610-ELLE","NbOfTxs":10,"CtrlSum":"1.367","LedgerHash":"0x…"}
```

- Field names and limits follow ISO 20022 (`Max35Text` identifiers, 4-letter `ExternalPurpose1Code`, `Max140Text` remittance info), so bank-side systems can map them without translation.
- `memoId = keccak256("tp1:" + EndToEndId)`. Anyone holding the ledger can query a payment's memo log directly by its indexed `memoId`.
- `LedgerHash` is `keccak256` over the sorted lines `EndToEndId|recipient|amountUnits|token`. It commits to the payments without revealing them.
- **Memos are public and permanent.** They carry identifiers only. Payee names and other personal data stay in the payer's own ledger and are never written on-chain.

This is a proposal, not an official Arc standard. If Arc publishes a canonical memo schema, the SDK should adopt it.

## How a memo is tied to its transfer

Inside a batch, each `Memo` event records `callDataHash = keccak256(data)` of the call it wrapped. Tallypay recomputes `keccak256(transfer(to, value))` for every observed USDC `Transfer` and links it to the memo in the same transaction with the same target and hash. This works for any number of payments per transaction.

### Findings from building on Arc

Verified with real testnet transactions ([example](https://explorer.testnet.arc.io/tx/0xd1033e597ec4ef74b1118356d6a14dcc61fcb09d0ad34fdec0ef3a7d8baf1865)):

- `Memo` calls nested inside `Multicall3From.aggregate3` work, and both the `Memo` event's `sender` and the USDC `Transfer`'s `from` are the paying EOA.
- Each USDC transfer emits **two** `Transfer` logs: one from the USDC contract `0x3600…` (6 decimals) and one from the EIP-7708 system emitter `0xffff…fffe` (18 decimals). Tallypay reads only the token contract's log to avoid double counting.
- Public RPCs cap `eth_getLogs` at about 10,000 blocks, so scans are chunked. Mainnet produces roughly two blocks per second.
- `maxFeePerGas` must be at least 20 gwei or the transaction is dropped silently.

## Architecture

```
packages/sdk     @tallypay/sdk    networks, ABIs, memo codec, ledger hashing, batch builder, log reader
packages/recon   @tallypay/recon  reconciliation engine, anchor check, journal builder, CSV/Xero export
apps/web         @tallypay/web    static React app: Overview, Reconcile, Pay a run
scripts/                          CLI: spike, PromptBazaar scenario, reconcile
```

- **No backend and no keys on a server.** The web app reads Arc directly from the browser. Payouts are signed by the user's own wallet (EIP-1193).
- **No custom contracts.** Payments go through Arc's predeployed `Memo` (`0x5294…e505`) and `Multicall3From` (`0x522f…47D0`).

## Run it

Requirements: Node.js 20+.

```bash
npm install
npm test                      # unit tests for memo codec, batching, reconciliation, journals
npm run dev --workspace @tallypay/web
```

CLI scripts need a funded wallet in `.env` (see `.env.example`):

```bash
npm run spike                                   # testnet: batch of memo transfers, prints every log
npm run demo -- --network=arc-testnet           # PromptBazaar scenario; writes apps/web/public/demo/*.json
npm run reconcile -- apps/web/public/demo/promptbazaar-arc-testnet.json --out=reports/testnet
```

Demo recipients are derived from the payer key, so demo funds can be swept back.

## Accounting notes

Journal entries are **templates for review by an accountant, not accounting or tax advice.**

- Cleared payouts: debit *Payouts payable*, credit *USDC wallet (Arc)*. Exceptions: debit *Suspense* until resolved.
- Network fees are paid in USDC and booked as a USD expense, once per day, because individual fees are fractions of a cent.
- Account codes are configurable (`ChartOfAccounts`).
- The Xero export follows the "Import manual journals" layout (`*Narration, *Date, Description, *AccountCode, *TaxRate, *Amount, TrackingName1, TrackingOption1`; positive amounts are debits, negative are credits), includes USDC lines only, and rounds each line's magnitude half-up to cents so debits and credits stay equal. Check the headers against the template downloaded from your own Xero organisation.
- Xero does not accept bank accounts or system accounts (Accounts Payable/Receivable) in manual journals. Set up the USDC wallet as a **Current Asset** account and *Payouts payable* as an ordinary **Current Liability** account, then map their codes in `ChartOfAccounts`.
- Classification of stablecoins is still moving: FASB proposed in August 2026 that qualifying stablecoins could be cash equivalents.

## Limitations

- Arc's `Memo` requires an EOA caller. Smart-contract wallets fall back to intent matching, which is weaker when several open entries share the same recipient and amount.
- Intent matching pairs entries with transfers oldest-first; it does not yet use invoice due dates.
- EURC is supported by the SDK and the reconciler, but journal export needs a recorded FX rate before EURC lines can be booked in a USD ledger.
- Browser scans are limited to 200,000 blocks per run. Longer periods need an indexer (Goldsky, The Graph and Envio support Arc).

## Roadmap

- Direct sync to Xero and QuickBooks via OAuth, beyond CSV import
- Webhook ingestion from payout providers on Arc, so their runs reconcile automatically
- EURC and local stablecoins with FX rates recorded at settlement
- View-key audits once Arc's opt-in privacy ships: an auditor could verify a run without the ledger becoming public

## License

Apache-2.0. Tallypay is an independent open-source project built on Arc and is not affiliated with Circle.

---

## 中文簡介

Tallypay 是 Arc 上的對帳層：把 Arc 上每一筆 USDC 付款對到帳本上的那一筆，抓出異常，並把其餘的轉成會計師可以匯入的分錄。

- 只用 Arc 原生的 `Memo` 與 `Multicall3From`，沒有自訂合約
- Memo 欄位採用 ISO 20022 命名，只放識別碼，不放個人資料
- 帳本雜湊錨定在鏈上，事後竄改帳本可以被精準抓出
- 沒有 Memo 的錢包（Safe、MPC）也能依「收款人、金額、幣種」比對
- 網站是純前端，不經過伺服器，也不保管任何私鑰
- PromptBazaar 是模擬的市集，但所有交易都是真實的 Arc 交易
