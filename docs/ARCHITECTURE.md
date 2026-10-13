# Architecture

How Tieout turns Arc's primitives into books, what it trusts, and where it stops. Written for a technical reviewer who wants to know whether the design holds up, not just whether the demo runs.

## 1. The problem in one sentence

A USDC transfer on Arc tells you who paid whom, how much and when. It does not tell you *what for*. Accounting needs the "what for", in both directions, with evidence an auditor can check, in a format the ledger system already speaks.

## 2. Three grades of evidence

Every settled item in a Tieout report carries an `evidence` grade. The grades are ordered, and the reconciler always tries the stronger one first.

| Grade | What links the transfer to the ledger entry | Who can produce it | Precedent |
|---|---|---|---|
| **memo** | A `Memo` event in the same transaction, bound to this exact inner call by `callDataHash` | The payer, at the moment of paying (EOA only on Arc) | Tempo `transferWithMemo`, Stellar memos, ISO 20022 `EndToEndId` |
| **reference** | A `tp1-ref` memo published later by a trusted EOA, naming the transaction and the EndToEndId, sharing the payment's `memoId` | Anyone the ledger owner trusts: an ops wallet attesting a Safe's payouts, a custodian's signer, the payee | Arc docs' own workaround for smart-contract wallets ("separate EOA-signed memo transaction"); XRPL source-tag/destination-tag symmetry |
| **manual** | A recorded decision naming the entry and the transfer, with a note | A person, on an ambiguous pairing; compared field by field like the others, so a wrong decision surfaces as a mismatch | Modern Treasury manual review; beancount-import's accepted-entry metadata |
| **intent** | Counterparty, token and amount agree, and the pairing is unique in both directions | Nobody; it is inferred | Modern Treasury expected-payment rules, bank-statement matchers |

Intent is deliberately the weakest and the most conservative. If two ledger entries could claim one transfer, or one entry could be settled by two transfers, nothing is matched: the entry and the transfers are reported as `ambiguous` with the candidates listed. A person decides in the UI (recorded as `manual`, with a note, in the audit bundle) or publishes references, and the pairing resolves. This follows Modern Treasury's rule that multiple candidates go to manual review, and the Solana Pay lesson (CVE-2022-35917) that "found" is not "validated".

With no ledger at all, the same pipeline produces a **statement**: every movement listed, booked to suspense, with the roll-forward and the camt.054 export. That is the bank-statement equivalent for an Arc wallet, and the quickest way to see what Tieout reads from any address.

## 3. Data flow

```
Ledger (CSV/JSON, off-chain, may contain names)         Arc public RPC (CORS, no key)
   │ runs[]: PmtInfId + instructions (direction in/out)      │
   │                                                          │ eth_getLogs ×5 per 9,000 blocks, ≤2 in flight
   │                                                          │   USDC/EURC Transfer from|to account
   │                                                          │   EIP-7708 system Transfer from|to account
   │                                                          │   Memo events from account ∪ memoSenders
   │                                                          │ eth_getTransactionReceipt per sent tx (fees)
   │                                                          │ balanceOf at fromBlock-1 and toBlock
   ▼                                                          ▼
reconcile(runs, activity, options) ◄──────────── observeAccount(): AccountActivity
   │  pass 1 memo · pass 2 reference · pass 3 intent (unique only)
   │  anchor check per run · balance roll-forward per token
   ▼
ReconReport ──► buildJournal() ──► CSV · Xero · QuickBooks
            ──► camt054Xml()
            ──► audit bundle (ledgers + activity + every decision)
```

Everything right of the ledger is deterministic given the chain. The audit bundle contains the ledgers, the serialised `AccountActivity` and the report, so a second party with any Arc RPC can re-run `reconcile` and compare.

## 4. Reading the chain correctly

- **Two logs per ERC-20 transfer, one per native transfer.** Arc emits an ERC-20 `Transfer` from `0x3600…` (6 decimals) and an EIP-7708 `Transfer` from `0xffff…fffe` (18 decimals) for every USDC call, and only the second for a native value send. The reader keys ERC-20 transfers by `(tx, from, to, value×10¹²)` and drops the system log that shadows each one; what remains from the system emitter is a native send, kept and flagged. Reading only the token contract misses every wallet "send"; reading both without this dedupe double counts.
- **Memo ↔ transfer binding.** A memo belongs to a transfer when both are in the same transaction, the memo's `target` is the token, the memo follows the transfer in log order, and `keccak256(transfer(to, value)) == callDataHash`. Nearest preceding match wins, once. This is exact even for ten identical payments in one batch.
- **Anchors and references** are memos wrapped around `transfer(sender, 0)`; the reader recognises them by prefix and never counts the zero-value self-transfer as money.
- **Balances** are read at `fromBlock − 1` and `toBlock`. Public RPCs serve historical `balanceOf`, so the roll-forward needs no archive node. If a provider refuses, the roll-forward is simply absent, never wrong.
- **Request shape.** Per 9,000-block chunk: two `eth_getLogs` for token transfers (out, in), two for the system emitter, one for memos. Then one `getBlock` per distinct block that carried a transfer or memo and one `getTransactionReceipt` per transaction the account sent, four in flight, over a JSON-RPC batching transport (20 ms window) so bursts collapse into single HTTP requests. Public endpoints still 429 occasionally; viem retries with backoff. Measured on the testnet demo range: 12 transfers, 1 anchor, 3 receipts, 2 balances, well under five seconds end to end.
- **Fees** are collected only for transactions the account sent that moved tokens or wrote memos. A transaction the account sent for some other reason (an approval, a contract call) is not fetched; its fee then shows up in the roll-forward as "unexplained", which is the correct outcome: the scan says what it did not see.

## 5. Idempotency

- A payout run's anchor memo serves as its idempotency key, with an honest limit. Before sending, the Pay page looks up `runAnchorMemoId(PmtInfId)` on-chain and declines to send a run this wallet already anchored; without an anchor, the first payment's `memoId` serves the same purpose. This is a client-side check that lowers the risk of a double-submitted run. It is not an on-chain guarantee: two sends racing within the same block, or sends from two different wallets, are not prevented. Atomic enforcement would require a custom contract, which is deliberately out of scope; the reconciler reports any second settlement of an EndToEndId as `duplicate`, so a race is caught after the fact, never hidden.
- The anchor proves the ledger held now matches the ledger committed when the money moved. It does not prove the original ledger was correct; reconciliation, the roll-forward and a reviewer do that.
- Duplicate `EndToEndId`s in one ledger are rejected before anything runs. Duplicate recipient+amount pairs in one run are warned about, not blocked, because they can be legitimate.
- A second transfer for an already-settled `EndToEndId` is reported as `duplicate`, never silently merged.

## 6. Trust boundaries

| Input | Trusted? | Why |
|---|---|---|
| Ledger file | Yes: it is the user's own books, loaded in the browser, never uploaded | The whole point is to check the chain against it |
| Arc RPC responses | Yes, as data; the reconciler verifies hashes it can recompute (`callDataHash`, `LedgerHash`) and the roll-forward cross-checks totals; the user can point the app at their own node | A lying RPC can hide transfers; it cannot forge a memo that hashes to a different transfer |
| Recorded decisions | As the user's own assertions, labelled `manual`, still compared field by field | A decision that does not fit the transfer shows as a mismatch, not as a quiet match |
| Memo contents from the account's own transactions | Yes | The account signed them |
| Reference memos | Only from `trustedReferenceSigners` (the account itself plus signers the user names) | Anyone can publish a `tp1-ref` naming your transaction; only signers you chose are believed |
| Payment request links | No: the page shows the recipient and amount and tells the payer to confirm them out of band; links can carry an expiry | A link is as trustworthy as whoever sent it |
| Demo snapshot | Labelled, never silently | Used only when the live scan fails |

No backend exists, so there is no server-side state to compromise, and no key is ever held by the app: payouts and references are signed by the user's EIP-1193 wallet.

## 7. What is deliberately not here

- **No custom contract.** `Memo` and `Multicall3From` ship at genesis; using them well is the claim. A `memo_required` registry (Stellar SEP-29 style) would be a good Arc-wide addition but belongs to Arc, not to one tool.
- **No indexer.** The browser reads at most 200,000 blocks per run (about 28 hours on mainnet). Beyond that a Goldsky/Envio/Graph pipeline should feed the same `AccountActivity` shape; the reconciler does not care where it came from.
- **No amount tolerance.** USDC to USDC on one chain has no fees inside the transfer and no FX, so a one-unit difference is a real difference. Cross-chain legs, when they come, will need Modern-Treasury-style variance ranges.
- **No instalments or refunds yet.** Reserved in the memo spec (`InstlmtNb`, `RtrRef`).
- **No privacy.** Memos carry identifiers only; names stay in the ledger. The salted-memoId variant for unlinkable payments is specified, not built.

## 8. Failure modes and what the user sees

| Situation | Behaviour |
|---|---|
| RPC rate-limits (429) | At most two requests in flight per chunk; viem retries; demos fall back to a labelled snapshot |
| Wallet paid with a Safe, no memo possible | `matched_by_intent` if unique, `ambiguous` otherwise; "Attach references" turns it into `matched` for good |
| Two identical payouts to one address, no memos | `ambiguous`, candidates listed, money held in suspense until decided |
| Ledger edited after the run | Anchor check names the entry and the old and new values |
| A wallet send the ledger never recorded | `unexpected`, flagged native, booked to suspense, and the roll-forward still ties |
| Payment request link reused after expiry | Refused with an explanation |
