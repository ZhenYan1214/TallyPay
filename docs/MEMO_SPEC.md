# Tallypay memo format `tp1` (proposal)

Status: proposal, version 1. Implemented in `@tallypay/sdk` (`packages/sdk/src/memo.ts`). Not an official Arc or Circle standard. If Arc publishes a canonical payment-memo schema, `tp1` should be retired in favour of it and the SDK will decode both during a transition.

## 1. Goal

Give a USDC payment on Arc the same reference data a bank credit transfer carries, so that:

- the payer can reconcile the payment against its own ledger without a transaction hash,
- a third party holding only the ledger identifier can find and verify the payment on-chain,
- nothing personal is written to a public, permanent log.

## 2. Transport

Memos are carried by Arc's predeployed `Memo` contract, `0x5294E9927c3306DcBaDb03fe70b92e01cCede505`, through

```solidity
function memo(address target, bytes data, bytes32 memoId, bytes memoData)
```

- `target` is the token contract (USDC `0x3600…0000` or EURC).
- `data` is the ERC-20 `transfer(to, amount)` calldata.
- `memoId` is the indexed lookup key (section 5).
- `memoData` is the memo payload (sections 3 and 4).

The contract emits `Memo(sender, target, callDataHash, memoId, memo, memoIndex)` after the inner call, with `callDataHash = keccak256(data)`. That hash is what ties the memo to one exact transfer (section 6).

Several memo calls are batched into one transaction with Arc's `Multicall3From` (`0x522fAf9A91c41c443c66765030741e4AaCe147D0`). Both contracts route through Arc's `CallFrom` precompile, so the paying EOA stays `msg.sender` of every transfer and `sender` of every memo. Verified on Arc testnet; see the README.

## 3. Payment memo

`memoData` is UTF-8 text: the prefix `tp1:` followed by a JSON object with a fixed key order.

```text
tp1:{"EndToEndId":"PB-202610-ELLE-S04","PmtInfId":"PB-202610-ELLE","Purp":"COMM","CdtrRef":"STMT-202610-S04"}
```

| Key | Required | ISO 20022 element | Constraint | Meaning |
|---|---|---|---|---|
| `EndToEndId` | yes | `PmtId/EndToEndId` | Max35Text | Unique per payment within the payer's system. |
| `PmtInfId` | no | `PmtInf/PmtInfId` | Max35Text | The payout run or batch this payment belongs to. |
| `Purp` | no | `Purp/Cd` (ExternalPurpose1Code) | 4 upper-case letters | Purpose: `COMM` commission, `SUPP` supplier, `SALA` salary, `GDDS` goods, … |
| `CdtrRef` | no | `RmtInf/Strd/CdtrRefInf/Ref` | Max35Text | Creditor reference, typically an invoice or statement number. |
| `Ustrd` | no | `RmtInf/Ustrd` | 1–140 chars | Unstructured remittance text. |

Max35Text uses the SWIFT character set: `A-Z a-z 0-9 / - ? : ( ) . , ' + space`. Keys are serialised in the order above; absent optional keys are omitted, never written as `null`.

Keys use ISO 20022 element names on purpose: a bank or ERP integration maps them one-to-one into `pain.001` or `camt.054` without a translation table.

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

## 5. memoId derivation

```text
payment:  memoId = keccak256(utf8("tp1:" + EndToEndId))
anchor:   memoId = keccak256(utf8("tp1-run:" + PmtInfId))
```

`memoId` is an indexed topic of the `Memo` event. Anyone who knows an `EndToEndId` can run one topic-filtered `eth_getLogs` against the `Memo` contract and get the payment back, without knowing the transaction hash or the block. This is the same lookup model as Solana Pay reference keys and Stellar memos, where the identifier exists before the payment and the chain is queried by it afterwards.

## 6. Linking a memo to its transfer

Inside one transaction, a memo belongs to the transfer `T` if and only if

1. `T` is a `Transfer` event emitted by the memo's `target` contract,
2. `T` precedes the `Memo` event in the log order (the contract emits `Memo` after the inner call),
3. `keccak256(transfer(T.to, T.value)) == Memo.callDataHash`.

When several transfers satisfy this (identical recipient and amount in one batch), the nearest preceding one is chosen and marked used, so each memo links to exactly one transfer. Arc also emits a second `Transfer` from the EIP-7708 system address `0xffff…fffe` with 18 decimals for every USDC move; it fails condition 1 and is ignored.

## 7. LedgerHash

```text
line_i     = EndToEndId_i | lowercase(recipient_i) | amountUnits_i | token_i
LedgerHash = keccak256(utf8(join(sort(line_1..line_n), "\n")))
```

`amountUnits` is the integer amount in 6-decimal base units, so `1.5` and `1.50` hash identically. Lines are sorted so row order does not matter. The hash reveals nothing about the payments; verifying it requires the ledger.

## 8. Privacy

Memos are public and permanent. `tp1` carries identifiers only. Payee names, countries, tax ids and bank details stay in the payer's ledger. The reference implementation keeps `payeeName` and `payeeCountry` in the off-chain ledger type and never serialises them into `memoData`.

## 9. Size and cost

A typical payment memo is 100–130 bytes of calldata plus one event. Measured on Arc testnet, a batch of ten memo-tagged payments plus an anchor used 642,626 gas, which is about 64,000 gas per payment including the amortised anchor, against roughly 74,000 gas for a plain USDC transfer sent on its own. The memo is not the expensive part; the per-transaction base cost is, and batching removes it.

## 10. Versioning

The prefix is the version. A future `tp2:` may switch to a binary encoding or add fields; readers should treat unknown prefixes as "memo present, not in Tallypay format" and fall back to intent matching, which is what the reference reconciler does today.

## 11. Why JSON and not ABI encoding

Readability on explorers and in audit files, zero tooling needed to decode, and direct correspondence to ISO 20022 element names. The cost difference is small next to the per-transaction base fee. If gas ever matters more than legibility, section 10 covers the move.

## 12. References

- Arc, Transaction memos: https://docs.arc.io/arc/concepts/transaction-memos
- Arc, Batched transactions: https://docs.arc.io/arc/concepts/batched-transactions
- ISO 20022 `pain.001` message definitions (element names used above)
- Stellar SEP-29, account memo requirements: https://stellar.org/protocol/sep-29
- Solana Pay specification, reference keys: https://docs.solanapay.com/spec
- Tempo, transfer memos on TIP-20: https://docs.tempo.xyz/guide/payments/transfer-memos
