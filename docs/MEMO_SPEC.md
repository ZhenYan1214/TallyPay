# Tieout memo format `tp1` (proposal)

Status: proposal, version 1. Implemented in `@tieout/sdk` (`packages/sdk/src/memo.ts`). Not an official Arc or Circle standard. If Arc publishes a canonical payment-memo schema, `tp1` should be retired in favour of it and the SDK will decode both during a transition.

## 1. Goal

Give a USDC payment on Arc the same reference data a bank credit transfer carries, so that:

- the payer can reconcile the payment against its own ledger without a transaction hash,
- the payee can reconcile a receipt against the invoice it issued, without asking the payer for a hash,
- a third party holding only the ledger identifier can find and verify the payment on-chain,
- nothing personal is written to a public, permanent log.

Arc's own description of what memos are for: payments and payouts that are "easier to trace, reconcile, and connect to downstream systems", consumed by "offchain systems that run accounting, reporting, and operations" ([Arc blog, June 2026](https://www.arc.io/blog/arc-transaction-memos-structured-context-for-onchain-transactions)). Arc leaves the encoding to the application. `tp1` is one answer.

## 2. Transport

Memos are carried by Arc's predeployed `Memo` contract, `0x5294E9927c3306DcBaDb03fe70b92e01cCede505` (same address on mainnet and testnet; verified deployed on mainnet 2026-10-13), through

```solidity
function memo(address target, bytes data, bytes32 memoId, bytes memoData)
```

- `target` is the token contract (USDC `0x3600…0000` or EURC).
- `data` is the ERC-20 `transfer(to, amount)` calldata.
- `memoId` is the indexed lookup key (section 5).
- `memoData` is the memo payload (sections 3 and 4).

The contract emits `Memo(sender, target, callDataHash, memoId, memo, memoIndex)` after the inner call, with `callDataHash = keccak256(data)`. That hash is what ties the memo to one exact transfer (section 6). `Memo` only emits when the inner call succeeds, so a found memo is also a successful transfer.

Several memo calls are batched into one transaction with Arc's `Multicall3From` (`0x522fAf9A91c41c443c66765030741e4AaCe147D0`). Both contracts route through Arc's `CallFrom` precompile, so the paying EOA stays `msg.sender` of every transfer and `sender` of every memo. Verified on Arc testnet; see the README.

## 3. Payment memo

`memoData` is UTF-8 text: the prefix `tp1:` followed by a JSON object with a fixed key order.

```text
tp1:{"EndToEndId":"PB-202610-ELLE-S04","PmtInfId":"PB-202610-ELLE","Purp":"COMM","CdtrRef":"STMT-202610-S04"}
```

| Key | Required | ISO 20022 element | Constraint | Meaning |
|---|---|---|---|---|
| `EndToEndId` | yes | `PmtId/EndToEndId` | Max35Text | Unique per payment within the system that allocated it. |
| `PmtInfId` | no | `PmtInf/PmtInfId` | Max35Text | The payout run, batch or invoice series this payment belongs to. |
| `Purp` | no | `Purp/Cd` (ExternalPurpose1Code) | 4 upper-case letters | Purpose: `COMM` commission, `SUPP` supplier, `SALA` salary, `GDDS` goods, … |
| `CdtrRef` | no | `RmtInf/Strd/CdtrRefInf/Ref` | Max35Text | Creditor reference, typically an invoice or statement number. |
| `Ustrd` | no | `RmtInf/Ustrd` | 1–140 chars | Unstructured remittance text. Mutually exclusive with `CdtrRef` in ISO 20022; `tp1` allows both but exports only one. |

Max35Text uses the SWIFT character set: `A-Z a-z 0-9 / - ? : ( ) . , ' + space`. Keys are serialised in the order above; absent optional keys are omitted, never written as `null`.

Keys use ISO 20022 element names on purpose: a bank or ERP integration maps them one-to-one into `pain.001` or `camt.054` without a translation table. The reference reconciler emits exactly that `camt.054` (`packages/recon/src/camt.ts`).

### 3.1 Who allocates `EndToEndId`

Whoever keeps the books the payment will be matched against:

- **Payouts**: the payer allocates it (its payout run id plus a line number). This is how `pain.001` works.
- **Receivables**: the payee allocates it (its invoice id) and hands it to the payer, for example through a payment request link (`#/pay?to=…&amount=…&id=…`). The payer's wallet writes it into the memo. This is the Solana Pay transfer-request and Stellar SEP-31 pattern: the identifier is unique in the receiver's books by construction, because the receiver chose it.

Both sides can reconcile the same transfer against their own ledger, each by their own id, because the memo can carry the payer's `PmtInfId` and the payee's `CdtrRef` at once.

## 4. Run anchor

A payout run starts with one anchor memo wrapped around a zero-value `transfer(payer, 0)`. The self-transfer exists only because `Memo` needs an inner call to wrap; it moves nothing and is filtered out by the reader.

```text
tp1-run:{"PmtInfId":"PB-202610-ELLE","NbOfTxs":10,"CtrlSum":"1.367","LedgerHash":"0x…"}
```

| Key | ISO 20022 element | Meaning |
|---|---|---|
| `PmtInfId` | `PmtInf/PmtInfId` | Run identifier. |
| `NbOfTxs` | `GrpHdr/NbOfTxs` | Number of payments in this transaction. |
| `CtrlSum` | `GrpHdr/CtrlSum` | Sum of those payments, decimal string in token units. |
| `LedgerHash` | (none) | Commitment to the payment list, section 7. |

The anchor commits to the ledger **as it was when the money moved**. If someone later edits an amount or recipient in the ledger, the stored hash no longer matches, and the reconciler reports exactly which entry changed.

The anchor is also the run's **idempotency key**. Before sending, a client looks up `runAnchorMemoId(PmtInfId)` on-chain; if this wallet already anchored that run, it refuses to send again. A double-submitted payroll approval therefore cannot pay everyone twice, which is the failure mode behind several well-publicised exchange and payroll incidents.

## 4a. Reference memo

A reference attaches an `EndToEndId` to a transfer that could not carry a memo itself: one sent from a Safe or ERC-4337 account (which `Memo` rejects), from a custodian or exchange, or by a plain wallet send. Any EOA publishes it later; it wraps a zero-value `transfer(signer, 0)` like the anchor does.

```text
tp1-ref:{"EndToEndId":"PB-202610-ELLE-S11","TxHash":"0x…","PmtInfId":"PB-202610-ELLE"}
```

| Key | Required | Meaning |
|---|---|---|
| `EndToEndId` | yes | The ledger entry being referenced. |
| `TxHash` | yes | The transaction that carried the transfer, lower-case 32-byte hex. |
| `PmtInfId` | no | The run the entry belongs to. |

Its `memoId` is `paymentMemoId(EndToEndId)`, the same value a memo on the original payment would have carried, so a lookup by `EndToEndId` finds the reference and, through `TxHash`, the payment. The Memo event's `sender` is the attesting EOA; the transfer's `from` is still whoever paid. A reconciler must only believe references from signers the ledger owner trusts, and must still compare counterparty, token, amount and direction before settling. Several references may name one transaction (a Safe batch); the reconciler picks, per transfer, the reference whose entry fits.

Arc's documentation names a "separate EOA-signed memo transaction" as the workaround for smart-contract wallets. This is that workaround with a schema, so every tool on the chain can read it.

## 5. memoId derivation

```text
payment:    memoId = keccak256(utf8("tp1:" + EndToEndId))
reference:  memoId = keccak256(utf8("tp1:" + EndToEndId))   // same as the payment it references
anchor:     memoId = keccak256(utf8("tp1-run:" + PmtInfId))
```

`memoId` is an indexed topic of the `Memo` event. Anyone who knows an `EndToEndId` can run one topic-filtered `eth_getLogs` against the `Memo` contract and get the payment back, without knowing the transaction hash or the block. This is the lookup model of Solana Pay reference keys (`getSignaturesForAddress`) and Tempo's indexed `TransferWithMemo` memo, with a human-readable identifier behind the hash.

### 5.1 Linkability trade-off and the salted variant

A deterministic `memoId` means anyone who guesses an `EndToEndId` scheme can enumerate a payer's payments. Request Network and Ledgerline salt their references for that reason. `tp1` keeps the deterministic form as the default because the ids it carries are references, not identities, and because lookup-by-id without a shared secret is the feature. A reserved variant for payers who need unlinkability:

```text
memoId = keccak256(utf8("tp1s:" + salt + "|" + EndToEndId))
```

with a per-run salt kept in the payer's ledger and never written on-chain. The reader supports it when the ledger supplies the salt. Not yet implemented.

## 6. Linking a memo to its transfer

Inside one transaction, a memo belongs to the transfer `T` if and only if

1. `T` is a `Transfer` event emitted by the memo's `target` contract,
2. `T` precedes the `Memo` event in the log order (the contract emits `Memo` after the inner call),
3. `keccak256(transfer(T.to, T.value)) == Memo.callDataHash`.

When several transfers satisfy this (identical recipient and amount in one batch), the nearest preceding one is chosen and marked used, so each memo links to exactly one transfer. Arc also emits a second `Transfer` from the EIP-7708 system address `0xffff…fffe` with 18 decimals for every USDC move; it fails condition 1 and is ignored here. The reader uses that system log on its own only for native value transfers, which have no ERC-20 twin and can never carry a memo.

Finding a memo is not the same as validating a payment (the Solana Pay `findReference`/`validateTransfer` split, and CVE-2022-35917). A reconciler must still check counterparty, token, amount and direction against its ledger, and must settle each `EndToEndId` at most once; the reference implementation reports a second match as `duplicate`.

## 7. LedgerHash

```text
line_i     = EndToEndId_i | lowercase(recipient_i) | amountUnits_i | token_i
LedgerHash = keccak256(utf8(join(sort(line_1..line_n), "\n")))
```

`amountUnits` is the integer amount in 6-decimal base units, so `1.5` and `1.50` hash identically. Lines are sorted so row order does not matter. Only payout lines (money out) are hashed; receivables are not part of a run anchor. The hash reveals nothing about the payments; verifying it requires the ledger.

## 8. Privacy

Memos are public and permanent. `tp1` carries identifiers only. Payee names, countries, tax ids and bank details stay in the payer's ledger. The reference implementation keeps `payeeName` and `payeeCountry` in the off-chain ledger type and never serialises them into `memoData`. `Ustrd` is free text and is the only field that could leak; keep it to references.

## 9. Size and cost

A typical payment memo is 100–130 bytes of calldata plus one event. Measured on Arc testnet, a batch of ten memo-tagged payments plus an anchor used 642,626 gas, which is about 64,000 gas per payment including the amortised anchor, against roughly 74,000 gas for a plain USDC transfer sent on its own. The memo is not the expensive part; the per-transaction base cost is, and batching removes it.

## 10. Versioning and reserved fields

The prefix is the version. A future `tp2:` may switch to a binary encoding or add fields; readers should treat unknown prefixes as "memo present, not in Tieout format" and fall back to intent matching, which is what the reference reconciler does today.

Reserved for `tp1.1`, not yet implemented:

- `RtrRef`: the `EndToEndId` of the payment this one returns, so a refund links to its original (Stellar `MEMO_RETURN`, XRPL source-tag/destination-tag symmetry, ISO `RtrInf`).
- `InstlmtNb`: instalment number, so several transfers can settle one `EndToEndId` and the reconciler can report `partially_reconciled` (Request Network's additive balance model, Modern Treasury many-to-one).

## 11. Why JSON and not ABI encoding

Readability on explorers and in audit files, zero tooling needed to decode, and direct correspondence to ISO 20022 element names. The cost difference is small next to the per-transaction base fee. If gas ever matters more than legibility, section 10 covers the move.

## 12. References

- Arc, Transaction memos: https://docs.arc.io/arc/concepts/transaction-memos
- Arc, Batched transactions: https://docs.arc.io/arc/concepts/batched-transactions
- Arc, EVM differences (EIP-7708 transfer logs): https://docs.arc.io/arc/references/evm-differences
- ISO 20022 `pain.001` / `camt.054` message definitions (element names used above)
- Stellar SEP-29, account memo requirements: https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0029.md
- Stellar SEP-31, receiver-allocated memos: https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0031.md
- Solana Pay specification, reference keys: https://docs.solanapay.com/spec
- Tempo, transfer memos on TIP-20: https://docs.tempo.xyz/guide/payments/transfer-memos
- Request Network, salted payment references: https://docs.request.network/advanced/protocol-overview/how-payment-networks-work
- Modern Treasury, reconciliation rules (1:1, 1:many, many:1, variance): https://docs.moderntreasury.com/payments/docs/defining-reconciliation-rules
