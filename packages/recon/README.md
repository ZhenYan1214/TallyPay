# @tieout/recon

Reconciles a wallet's Arc activity (from `@tieout/sdk`) against a ledger, in both directions, with three grades of evidence and no guessing, and turns the result into journal entries, Xero and QuickBooks import files, an ISO 20022 camt.054 notification and a balance roll-forward.

```ts
import { reconcile, buildJournal, xeroManualJournalCsv, qboJournalCsv, camt054Xml } from "@tieout/recon";

const report = reconcile(runs, activity, { trustedReferenceSigners, decisions });
const journal = buildJournal(report, activity.fees);
```

Statuses: `matched`, `matched_by_intent`, `mismatch`, `ambiguous`, `missing`, `duplicate`, `unexpected`. Evidence: `memo`, `reference`, `manual`, `intent`. Pure functions, no I/O. Apache-2.0.
