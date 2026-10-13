# Integrating Tieout

For a payout provider, a treasury tool or an invoicing app on Arc that wants its payments to reconcile without asking customers to copy transaction hashes. Three integration points, each a few lines. Everything is `@tieout/sdk` (viem underneath, no backend). Both packages build to plain ESM with type declarations (`npm run build:packages`); until they are on npm, install them from the repository or vendor `packages/sdk` and `packages/recon`.

## 1. Emit memos when you pay (EOA payers)

```ts
import { ARC_MAINNET, buildPayoutRun, MIN_MAX_FEE_PER_GAS } from "@tieout/sdk";

const plan = buildPayoutRun({
  network: ARC_MAINNET,
  payer: ops.address,                 // the EOA that signs
  PmtInfId: "PAYRUN-2026-10-31",      // your batch id (ISO 20022 PmtInfId, ≤35 chars)
  instructions: rows.map((r) => ({
    EndToEndId: r.payoutId,           // your per-payment id (≤35 chars); the customer's ledger key
    recipient: r.wallet,
    amount: r.amountUsdc,             // decimal string, e.g. "125.50"
    token: "USDC",
    Purp: "SUPP",                     // or COMM, SALA, GDDS …
    CdtrRef: r.invoiceNumber,
  })),
});
await walletClient.sendTransaction({ to: plan.to, data: plan.data, maxFeePerGas: MIN_MAX_FEE_PER_GAS * 3n, maxPriorityFeePerGas: 1_000_000_000n });
```

One transaction, up to 100 payments, through Arc's predeployed `Multicall3From` and `Memo`. The first call anchors the ledger hash; `plan.anchor.LedgerHash` is what you store with the batch. Before sending, look up `runAnchorMemoId(PmtInfId)` with `findMemos` and decline if it already exists. That lowers the risk of a double send; it is not atomic, so keep your own idempotency key around the send as well and treat a `duplicate` in reconciliation as the backstop.

## 2. Publish references when you cannot emit memos (Safe, custodian, exchange)

Arc's `Memo` reverts for smart-contract wallets. Pay however you pay, then let any EOA you control publish references for the transactions:

```ts
import { ARC_MAINNET, buildReferenceBatch } from "@tieout/sdk";

const plan = buildReferenceBatch({
  network: ARC_MAINNET,
  signer: ops.address,                // any EOA; it only pays the gas
  references: settled.map((p) => ({ EndToEndId: p.payoutId, TxHash: p.txHash, PmtInfId: p.batchId })),
});
await opsWallet.sendTransaction({ to: plan.to, data: plan.data, /* fees as above */ });
```

Each reference shares the payment's `memoId`, so a lookup by `EndToEndId` finds it, and any reconciler that trusts your ops signer treats the payment as first-class evidence. Tell your customers the signer address; they enter it as a "reference signer" when they reconcile.

## 3. Reconcile on your side, or let customers do it

```ts
import { ARC_MAINNET, observeAccount } from "@tieout/sdk";
import { reconcile, buildJournal, camt054Xml } from "@tieout/recon";

const activity = await observeAccount({ client, network: ARC_MAINNET, account: treasury, fromBlock, toBlock, memoSenders: [ops.address] });
const report = reconcile([{ PmtInfId: "PAYRUN-2026-10-31", instructions: rows }], activity, { trustedReferenceSigners: [treasury, ops.address] });
// report.items: matched | matched_by_intent | mismatch | ambiguous | missing | duplicate | unexpected, each with evidence and notes
// report.rollForward: opening + in - out - fees vs on-chain closing, per token
const journal = buildJournal(report, activity.fees);
const xml = camt054Xml(report, { ownerName: "Your Co" });
```

`observeAccount` reads ERC-20 and EIP-7708 logs, so native wallet sends are included; it never needs an archive node for the balance check. If you already run an indexer (Goldsky, Envio, The Graph), produce the same `AccountActivity` shape from it and call `reconcile` directly.

## Webhook shape we would like from payout providers

If your API already emits per-payout webhooks, the fields that make a customer's reconciliation deterministic are exactly the ISO 20022 ones: `EndToEndId` (your payout id), `PmtInfId` (batch id), `txHash`, `amount`, `token`, `recipient`, and, if you publish references, the signer address. Tieout's roadmap item "webhook ingestion from payout providers" is a thin adapter from that payload to `LedgerRun` + `memoSenders`.
