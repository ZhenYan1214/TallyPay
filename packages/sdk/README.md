# @tieout/sdk

Structured payment memos, batch payouts, after-the-fact references and log readers for Circle's Arc. Built on viem. No backend, no custom contracts: everything goes through Arc's predeployed `Memo` and `Multicall3From`.

```ts
import { ARC_MAINNET, buildPayoutRun, observeAccount, findMemos, memoIdFor } from "@tieout/sdk";
```

- `buildPayoutRun`, `buildSinglePayment`: memo-tagged USDC/EURC payments with an on-chain run anchor
- `buildReferenceBatch`: publish references for payments that could not carry memos (Safe, custodian, plain sends)
- `observeAccount`: every transfer in both directions (ERC-20 and native), memos, anchors, references, fees, balances
- `findMemos`, `memoIdFor`: look a payment up by its EndToEndId
- `blockRangeForDates`: dates to block numbers
- `serializeActivity`, `parseActivity`: freeze and reload a scan

Memo format: see `docs/MEMO_SPEC.md` in the repository. Apache-2.0.
