import { useEffect, useMemo, useState } from "react";
import { createWalletClient, custom, isAddress, type Address, type Hex } from "viem";
import {
  NETWORKS,
  MIN_MAX_FEE_PER_GAS,
  buildPayoutRun,
  erc20Abi,
  findMemos,
  fromUnits,
  paymentMemoId,
  runAnchorMemoId,
  toViemChain,
  txUrl,
  type MemoLookupResult,
  type NetworkId,
  type PayoutInstruction,
  type PayoutRunPlan,
} from "@tieout/sdk";
import { ExternalLink, Notice, PageHeader } from "../components/ui.tsx";
import { ensureNetwork, injectedProvider, publicClientFor } from "../lib/chain.ts";
import { download, instructionsToCsv, readLedgerFile, shortHash, type LoadedLedger } from "../lib/ledger-io.ts";

const TEMPLATE: PayoutInstruction[] = [
  { EndToEndId: "RUN-001-S01", recipient: "0x0000000000000000000000000000000000000001", amount: "0.10", token: "USDC", Purp: "COMM", CdtrRef: "STMT-001", payeeName: "Seller one", payeeCountry: "JP" },
  { EndToEndId: "RUN-001-S02", recipient: "0x0000000000000000000000000000000000000002", amount: "0.25", token: "USDC", Purp: "SUPP", CdtrRef: "INV-2026-17", payeeName: "Vendor two", payeeCountry: "DE" },
];

/** How far back to look for an earlier run with the same id before sending. */
const DOUBLE_PAY_LOOKBACK = 200_000n;

/**
 * Payment request link: #/pay?to=0x…&amount=12.50&id=INV-2026-0042&run=INV-2026&ref=INV-2026-0042&purp=SUPP&net=arc-mainnet
 * The payee builds it; the payer opens it and the single memo-tagged transfer is prefilled.
 * Same idea as a Solana Pay transfer request or a Stellar SEP-31 memo allocation: the
 * identifier is chosen by the receiver, so it is unique in the receiver's books by construction.
 */
export function parsePaymentRequest(hash: string, now = Date.now()): { network?: NetworkId; runId?: string; instruction?: PayoutInstruction; expired?: boolean } {
  const q = new URLSearchParams(hash.split("?")[1] ?? "");
  const to = q.get("to");
  const amount = q.get("amount");
  const id = q.get("id");
  if (!to || !amount || !id || !isAddress(to)) return {};
  const exp = q.get("exp");
  // Like a Coinbase Commerce charge deadline: a stale request must not be payable months later.
  if (exp && Number(exp) * 1000 < now) return { expired: true };
  const network = q.get("net");
  return {
    network: network === "arc-mainnet" || network === "arc-testnet" ? network : undefined,
    runId: q.get("run") ?? undefined,
    instruction: {
      EndToEndId: id,
      recipient: to,
      amount,
      token: (q.get("token") ?? "USDC").toUpperCase() === "EURC" ? "EURC" : "USDC",
      Purp: q.get("purp") ?? undefined,
      CdtrRef: q.get("ref") ?? undefined,
      Ustrd: q.get("msg") ?? undefined,
    },
  };
}

export function buildPaymentRequestUrl(base: string, p: { network: NetworkId; to: string; amount: string; id: string; run?: string; ref?: string; purp?: string; token?: string; expiresAt?: number }): string {
  const q = new URLSearchParams();
  q.set("to", p.to);
  if (p.expiresAt) q.set("exp", String(Math.floor(p.expiresAt)));
  q.set("amount", p.amount);
  q.set("id", p.id);
  q.set("net", p.network);
  if (p.run) q.set("run", p.run);
  if (p.ref) q.set("ref", p.ref);
  if (p.purp) q.set("purp", p.purp);
  if (p.token && p.token !== "USDC") q.set("token", p.token);
  return `${base}#/pay?${q.toString()}`;
}

type Tab = "send" | "request";

export default function Pay({ onReconcile }: { onReconcile: (ledger: LoadedLedger) => void }) {
  const [requested, setRequested] = useState(() => parsePaymentRequest(window.location.hash));
  useEffect(() => {
    const onHash = () => {
      const next = parsePaymentRequest(window.location.hash);
      if (next.instruction || next.expired) {
        setRequested(next);
        if (next.instruction) {
          setInstructions([next.instruction]);
          if (next.runId) setRunId(next.runId);
          if (next.network) setNetworkId(next.network);
          setAnchor(false);
          setSent(null);
          setTab("send");
        }
      }
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const [tab, setTab] = useState<Tab>("send");
  const [networkId, setNetworkId] = useState<NetworkId>(requested.network ?? "arc-mainnet");
  const [account, setAccount] = useState<Address | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [runId, setRunId] = useState(() => requested.runId ?? `RUN-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`);
  const [instructions, setInstructions] = useState<PayoutInstruction[]>(requested.instruction ? [requested.instruction] : []);
  const [anchor, setAnchor] = useState(!requested.instruction);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [priorRun, setPriorRun] = useState<MemoLookupResult[] | null>(null);
  const [priorExecution, setPriorExecution] = useState<{ txHash: Hex; runId: string } | null>(null);
  const [sent, setSent] = useState<{ hash: Hex; ledger: LoadedLedger } | null>(null);
  const network = NETWORKS[networkId];

  const plan = useMemo<{ plan?: PayoutRunPlan; error?: string }>(() => {
    if (!account || instructions.length === 0) return {};
    try {
      return { plan: buildPayoutRun({ network, payer: account, PmtInfId: runId, instructions, anchor }) };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [account, instructions, runId, anchor, network]);

  /** Same recipient and amount twice in one run is the classic double-pay. Warn, don't block: it can be legitimate. */
  const duplicates = useMemo(() => {
    const seen = new Map<string, string>();
    const out: string[] = [];
    for (const i of instructions) {
      const k = `${i.recipient.toLowerCase()}:${i.amount}:${i.token}`;
      const prev = seen.get(k);
      if (prev) out.push(`${prev} and ${i.EndToEndId} both pay ${i.amount} ${i.token} to ${shortHash(i.recipient)}`);
      else seen.set(k, i.EndToEndId);
    }
    return out;
  }, [instructions]);

  useEffect(() => {
    setPriorRun(null);
  }, [runId, networkId]);

  async function connect() {
    setError(null);
    const provider = injectedProvider();
    if (!provider) return setError("No browser wallet found. Install MetaMask, Rabby or another EIP-1193 wallet.");
    try {
      setBusy("Connecting…");
      const [addr] = (await provider.request({ method: "eth_requestAccounts" })) as Address[];
      await ensureNetwork(provider, networkId);
      setAccount(addr ?? null);
      if (addr) await refreshBalance(addr, networkId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function refreshBalance(addr: Address, id: NetworkId) {
    const units = await publicClientFor(id).readContract({ address: NETWORKS[id].contracts.usdc, abi: erc20Abi, functionName: "balanceOf", args: [addr] });
    setBalance(fromUnits(units));
  }

  /**
   * Idempotency: refuse to send a run whose anchor already exists on-chain from
   * this wallet. Without an anchor, the first payment's memoId stands in for it.
   */
  async function checkNotAlreadyPaid(): Promise<boolean> {
    const client = publicClientFor(networkId);
    const latest = await client.getBlockNumber();
    const firstId = instructions[0]?.EndToEndId;
    if (!anchor && !firstId) return true;
    const found = await findMemos({
      client,
      network,
      memoId: anchor ? runAnchorMemoId(runId) : paymentMemoId(firstId!),
      fromBlock: latest > DOUBLE_PAY_LOOKBACK ? latest - DOUBLE_PAY_LOOKBACK : 0n,
      toBlock: latest,
    });
    const mine = found.filter((m) => account && m.sender.toLowerCase() === account.toLowerCase());
    setPriorRun(mine);
    return mine.length === 0;
  }

  async function send() {
    if (!plan.plan || !account) return;
    setError(null);
    const provider = injectedProvider();
    if (!provider) return setError("No browser wallet found.");
    try {
      setBusy("Checking this run was not already paid…");
      if (!(await checkNotAlreadyPaid())) {
        setBusy(null);
        return;
      }
      setBusy("Waiting for wallet signature…");
      await ensureNetwork(provider, networkId);
      const wallet = createWalletClient({ chain: toViemChain(network), transport: custom(provider), account });
      const client = publicClientFor(networkId);
      await client.call({ account, to: plan.plan.to, data: plan.plan.data });
      const hash = await wallet.sendTransaction({
        to: plan.plan.to,
        data: plan.plan.data,
        maxFeePerGas: MIN_MAX_FEE_PER_GAS * 3n,
        maxPriorityFeePerGas: 1_000_000_000n,
      });
      setBusy("Confirming on Arc…");
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Transaction reverted");
      const block = receipt.blockNumber.toString();
      const ledger: LoadedLedger = {
        PmtInfId: runId,
        network: networkId,
        payer: account,
        createdAt: new Date().toISOString(),
        instructions: plan.plan.instructions.map((i, n) => ({ ...i, payeeName: instructions[n]?.payeeName, payeeCountry: instructions[n]?.payeeCountry })),
        execution: { txHash: hash, blockNumber: block },
        scan: { fromBlock: block, toBlock: block },
      };
      setSent({ hash, ledger });
      await refreshBalance(account, networkId);
    } catch (e) {
      setError((e as { shortMessage?: string }).shortMessage ?? (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={tab === "send" ? "Pay" : "Request"}
        title={tab === "send" ? "Pay a run with memos" : "Request a payment"}
        lead={
          tab === "send" ? (
            <>One transaction from your own wallet: a run anchor plus one memo-tagged USDC transfer per payee, batched with Arc's native <code className="font-mono text-xs">Multicall3From</code>. Tieout never holds keys or funds.</>
          ) : (
            <>Build a link that prefills the payer's side with your invoice id. When they pay through it, the memo carries your reference and the receipt reconciles itself.</>
          )
        }
        aside={
          <div className="flex gap-0.5 rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-[13.5px]">
            {(["send", "request"] as Tab[]).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`rounded-md px-3 py-1.5 font-medium transition-colors ${tab === t ? "bg-white text-slate-900 shadow-[var(--shadow-hair)] ring-1 ring-slate-200" : "text-slate-600 hover:text-slate-900"}`}>
                {t === "send" ? "Send a run" : "Request a payment"}
              </button>
            ))}
          </div>
        }
      />

      {tab === "request" && <RequestForm networkId={networkId} setNetworkId={setNetworkId} />}

      {tab === "send" && (
        <>
          {requested.expired && (
            <Notice tone="error">This payment request has expired. Ask the payee for a fresh link rather than paying from an old one.</Notice>
          )}
          {requested.instruction && (
            <Notice>
              This link is a payment request for <b>{requested.instruction.amount} {requested.instruction.token}</b> to{" "}
              <span className="font-mono text-xs">{shortHash(requested.instruction.recipient)}</span> with reference{" "}
              <span className="font-mono text-xs">{requested.instruction.EndToEndId}</span>. Check the recipient against what the payee told you through another channel before sending.
            </Notice>
          )}

          <section className="card grid gap-4 p-5 md:grid-cols-12">
            <div className="md:col-span-3">
              <span className="label">Network</span>
              <select className="input" value={networkId} onChange={(e) => { setNetworkId(e.target.value as NetworkId); setAccount(null); setBalance(null); }}>
                {Object.values(NETWORKS).map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
              </select>
            </div>
            <div className="md:col-span-5">
              <span className="label">Wallet</span>
              {account ? (
                <div className="flex h-[38px] items-center gap-2 text-sm">
                  <span className="font-mono">{shortHash(account)}</span>
                  {balance !== null && <span className="text-slate-500">· {balance} USDC</span>}
                </div>
              ) : (
                <button className="btn-primary" onClick={connect} disabled={!!busy}>Connect wallet</button>
              )}
            </div>
            <div className="md:col-span-4">
              <span className="label">Run id (PmtInfId)</span>
              <input className="input font-mono" value={runId} maxLength={35} onChange={(e) => setRunId(e.target.value.trim())} />
            </div>
            <div className="md:col-span-12 flex flex-wrap items-center gap-2">
              <label className="btn-secondary cursor-pointer">
                Upload payout ledger (CSV or JSON)
                <input
                  type="file"
                  accept=".csv,.json"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    try {
                      const parsed = await readLedgerFile(f);
                      setInstructions(parsed.instructions.filter((i) => i.direction !== "in"));
                      if (parsed.PmtInfId) setRunId(parsed.PmtInfId);
                      setPriorExecution(parsed.execution?.txHash && parsed.PmtInfId ? { txHash: parsed.execution.txHash as Hex, runId: parsed.PmtInfId } : null);
                      setSent(null);
                    } catch (err) {
                      setError((err as Error).message);
                    }
                  }}
                />
              </label>
              <button className="btn-secondary" onClick={() => download("tieout-ledger-template.csv", instructionsToCsv(TEMPLATE))}>Download CSV template</button>
              <label className="ml-2 flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={anchor} onChange={(e) => setAnchor(e.target.checked)} /> Anchor the ledger hash on-chain
              </label>
            </div>
          </section>

          {error && <Notice tone="error">{error}</Notice>}
          {plan.error && <Notice tone="error">{plan.error}</Notice>}
          {duplicates.length > 0 && (
            <Notice tone="warn">
              Possible double payment in this run: {duplicates.join("; ")}. Each gets its own EndToEndId, so it will go through if you proceed.
            </Notice>
          )}
          {priorExecution && priorExecution.runId === runId && (
            <Notice tone="error">
              This ledger file records that run <span className="font-mono text-xs">{priorExecution.runId}</span> was already sent in{" "}
              <ExternalLink href={txUrl(network, priorExecution.txHash)} className="font-mono text-xs">{shortHash(priorExecution.txHash)}</ExternalLink>.
              Not sending it again. Change the run id if this is genuinely a new run.
            </Notice>
          )}
          {priorRun && priorRun.length > 0 && (
            <Notice tone="error">
              {anchor ? "Run" : "Payment"} <span className="font-mono text-xs">{anchor ? runId : instructions[0]?.EndToEndId}</span> was already {anchor ? "anchored" : "sent with a memo"} on {network.name} by this wallet in{" "}
              {priorRun.map((m) => <ExternalLink key={m.txHash} href={txUrl(network, m.txHash)} className="font-mono text-xs">{shortHash(m.txHash)}</ExternalLink>)}.
              Not sending again. Change the run id if this is genuinely a new run.
            </Notice>
          )}

          {instructions.length > 0 && (
            <section className="card overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="table-head">
                  <tr>
                    <th className="px-4 py-3">EndToEndId</th>
                    <th className="px-4 py-3">Payee (off-chain)</th>
                    <th className="px-4 py-3">Recipient</th>
                    <th className="px-4 py-3">Purpose</th>
                    <th className="px-4 py-3">Reference</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {instructions.map((i) => (
                    <tr key={i.EndToEndId}>
                      <td className="px-4 py-2 font-mono text-xs">{i.EndToEndId}</td>
                      <td className="px-4 py-2">{i.payeeName ?? "—"}</td>
                      <td className="px-4 py-2 font-mono text-xs">{shortHash(i.recipient)}</td>
                      <td className="px-4 py-2 font-mono text-xs">{i.Purp ?? "—"}</td>
                      <td className="px-4 py-2 font-mono text-xs">{i.CdtrRef ?? "—"}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{i.amount} {i.token}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {plan.plan && (
            <section className="card space-y-4 p-5">
              <div className="grid gap-4 text-sm sm:grid-cols-4">
                <div><span className="label">Payments</span>{plan.plan.anchor.NbOfTxs}</div>
                <div><span className="label">Control sum</span>{plan.plan.anchor.CtrlSum} {plan.plan.instructions[0]?.token}</div>
                <div className="sm:col-span-2"><span className="label">Ledger hash (anchored)</span><span className="font-mono text-xs break-all">{plan.plan.anchor.LedgerHash}</span></div>
              </div>
              <p className="text-xs text-slate-500">
                Memos carry only ISO 20022 identifiers (EndToEndId, PmtInfId, Purp, CdtrRef). Payee names stay in your ledger and are never written on-chain.
                Before sending, Tieout checks Arc for an earlier anchor with the same run id, which lowers the risk of paying a double-submitted run twice. It is a pre-send check, not an on-chain lock.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <button className="btn-primary" disabled={!!busy || !!sent || (priorExecution?.runId === runId)} onClick={send}>
                  {busy ?? `Send ${plan.plan.anchor.NbOfTxs} payment${plan.plan.anchor.NbOfTxs === 1 ? "" : "s"} in one transaction`}
                </button>
                {networkId === "arc-mainnet" && <span className="text-xs text-amber-700">Mainnet: this moves real USDC.</span>}
              </div>
            </section>
          )}

          {sent && (
            <Notice>
              <div className="flex flex-wrap items-center gap-3">
                <span>
                  Paid in one transaction: <ExternalLink href={txUrl(network, sent.hash)} className="font-mono">{shortHash(sent.hash)}</ExternalLink>
                </span>
                <button className="btn-primary" onClick={() => onReconcile(sent.ledger)}>Reconcile this run</button>
                <button className="btn-secondary" onClick={() => download(`${sent.ledger.PmtInfId}.json`, JSON.stringify(sent.ledger, null, 2), "application/json")}>
                  Save ledger JSON
                </button>
              </div>
            </Notice>
          )}
        </>
      )}
    </div>
  );
}

function RequestForm({ networkId, setNetworkId }: { networkId: NetworkId; setNetworkId: (n: NetworkId) => void }) {
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [id, setId] = useState(() => `INV-${new Date().toISOString().slice(0, 7).replace("-", "")}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`);
  const [run, setRun] = useState("");
  const [ref, setRef] = useState("");
  const [purp, setPurp] = useState("SUPP");
  const [copied, setCopied] = useState(false);

  const valid = isAddress(to) && /^\d+(\.\d{1,6})?$/.test(amount) && Number(amount) > 0 && id.trim().length > 0;
  const base = `${window.location.origin}${window.location.pathname}`;
  const [days, setDays] = useState("30");
  const expiresAt = Number(days) > 0 ? Date.now() / 1000 + Number(days) * 86400 : undefined;
  const url = valid ? buildPaymentRequestUrl(base, { network: networkId, to, amount, id: id.trim(), run: run.trim() || undefined, ref: ref.trim() || undefined, purp: purp.trim() || undefined, expiresAt }) : "";
  const receivable: PayoutInstruction | null = valid ? { EndToEndId: id.trim(), direction: "in", recipient: to as Address, amount, token: "USDC", Purp: purp || undefined, CdtrRef: ref || undefined } : null;

  return (
    <section className="space-y-4">
      <div className="card grid gap-4 p-5 md:grid-cols-12">
        <div className="md:col-span-3">
          <span className="label">Network</span>
          <select className="input" value={networkId} onChange={(e) => setNetworkId(e.target.value as NetworkId)}>
            {Object.values(NETWORKS).map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
          </select>
        </div>
        <div className="md:col-span-6">
          <span className="label">Your receiving wallet</span>
          <input className="input font-mono" placeholder="0x…" value={to} onChange={(e) => setTo(e.target.value.trim())} />
        </div>
        <div className="md:col-span-3">
          <span className="label">Amount (USDC)</span>
          <input className="input font-mono" placeholder="12.50" value={amount} onChange={(e) => setAmount(e.target.value.trim())} />
        </div>
        <div className="md:col-span-4">
          <span className="label">EndToEndId (your invoice id)</span>
          <input className="input font-mono" value={id} maxLength={35} onChange={(e) => setId(e.target.value)} />
        </div>
        <div className="md:col-span-3">
          <span className="label">Run / batch (PmtInfId, optional)</span>
          <input className="input font-mono" value={run} maxLength={35} onChange={(e) => setRun(e.target.value)} />
        </div>
        <div className="md:col-span-3">
          <span className="label">Creditor reference (optional)</span>
          <input className="input font-mono" placeholder="INV-2026-0042" value={ref} maxLength={35} onChange={(e) => setRef(e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <span className="label">Purpose</span>
          <input className="input font-mono" value={purp} maxLength={4} onChange={(e) => setPurp(e.target.value.toUpperCase())} />
        </div>
        <div className="md:col-span-3">
          <span className="label">Link valid for (days, 0 = no expiry)</span>
          <input className="input font-mono" value={days} onChange={(e) => setDays(e.target.value.replace(/[^0-9]/g, ""))} />
        </div>
      </div>

      {valid && (
        <div className="card space-y-3 p-5">
          <span className="label">Payment request link</span>
          <div className="flex flex-wrap items-center gap-2">
            <input className="input font-mono text-xs" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
            <button
              className="btn-primary shrink-0"
              onClick={() => navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}
            >
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
          <p className="text-xs text-slate-500">
            Send this to the payer. Opening it prefills the Pay page with one memo-tagged transfer; they sign from their own wallet. The memo carries{" "}
            <span className="font-mono">{id.trim()}</span>, so your Reconcile run will match the receipt without a transaction hash.
            A payer whose wallet cannot call Memo (Safe, MPC) can still pay by plain transfer; Tieout then matches the receipt on amount and payer.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              className="btn-secondary"
              onClick={() => receivable && download(`${receivable.EndToEndId}.json`, JSON.stringify({ PmtInfId: run.trim() || receivable.EndToEndId, network: networkId, payer: to, createdAt: new Date().toISOString(), instructions: [receivable] }, null, 2), "application/json")}
            >
              Save as receivable ledger (JSON)
            </button>
            <span className="self-center text-xs text-slate-500">Load it on the Reconcile page once the payer has paid.</span>
          </div>
        </div>
      )}
    </section>
  );
}
