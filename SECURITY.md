# Security

Tieout is a static web app plus two libraries. It holds no keys, runs no server and stores nothing outside the user's browser. Even so, it builds transactions that move real USDC, so please report anything that could make it move the wrong amount to the wrong place or misrepresent what the chain says.

## Reporting

Open a GitHub security advisory on this repository (Security → Report a vulnerability), or email the maintainer address on the GitHub profile. Please do not file public issues for exploitable bugs. Expect an acknowledgement within a few days.

## What is in scope

- `buildPayoutRun`, `buildSinglePayment`, `buildReferenceBatch`: calldata that does not match the instructions, or an anchor that commits to the wrong ledger.
- The Pay page: a way to make the wallet sign something other than what the page shows, or to bypass the already-paid check.
- `observeAccount` and `reconcile`: a way to make a transfer disappear from a report, count twice, or settle against the wrong entry while the roll-forward still ties.
- Reference memos: a way for an untrusted signer's reference to be believed.
- Payment request links: a way to prefill a recipient or amount other than the one displayed.

## What is out of scope

- Arc, the `Memo` and `Multicall3From` predeploys, USDC, and public RPC availability.
- Phishing by sending someone a payment request link to the wrong address. The page shows the recipient and tells the payer to confirm it out of band; it cannot know who the payee really is.
- The accounting treatment itself. Journal entries are templates for an accountant.

## Design notes relevant to security

- No custom contracts: there is nothing of ours on-chain to exploit.
- Every transaction is simulated with `eth_call` before the wallet is asked to sign.
- References are only trusted from signers the user names; the account itself is always trusted.
- Recorded decisions are still compared field by field; a wrong decision shows as a mismatch.
- Memos carry identifiers only; payee names never leave the ledger file.
