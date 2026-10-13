import { useMemo, useState } from "react";
import { createWalletClient, custom, type Address, type Hex } from "viem";
import {
  NETWORKS,
  MIN_MAX_FEE_PER_GAS,
  buildPayoutRun,
  erc20Abi,
  fromUnits,
  toViemChain,
  txUrl,
  type NetworkId,
  type PayoutInstruction,
  type PayoutRunPlan,
} from "@tallypay/sdk";
import { ExternalLink, Notice } from "../components/ui.tsx";
import { ensureNetwork, injectedProvider, publicClientFor } from "../lib/chain.ts";
import { download, instructionsToCsv, readLedgerFile, shortHash, type LoadedLedger } from "../lib/ledger-io.ts";

const TEMPLATE: PayoutInstruction[] = [
  { EndToEndId: "RUN-001-S01", recipient: "0x0000000000000000000000000000000000000001", amount: "0.10", token: "USDC", Purp: "COMM", CdtrRef: "STMT-001", payeeName: "Seller one", payeeCountry: "JP" },
  { EndToEndId: "RUN-001-S02", recipient: "0x0000000000000000000000000000000000000002", amount: "0.25", token: "USDC", Purp: "SUPP", CdtrRef: "INV-2026-17", payeeName: "Vendor two", payeeCountry: "DE" },
];

export default function Pay({ onReconcile }: { onReconcile: (ledger: LoadedLedger) => void }) {
  const [networkId, setNetworkId] = useState<NetworkId>("arc-testnet");
  const [account, setAccount] = useState<Address | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [runId, setRunId] = useState(() => `RUN-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`);
  const [instructions, setInstructions] = useState<PayoutInstruction[]>([]);
  const [anchor, setAnchor] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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

  async function send() {
    if (!plan.plan || !account) return;
    setError(null);
    const provider = injectedProvider();
    if (!provider) return setError("No browser wallet found.");
    try {
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
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pay a run with memos</h1>
        <p className="mt-1 text-sm text-slate-600">
          One transaction from your own wallet: a run anchor plus one memo-tagged USDC transfer per payee, batched with Arc's
          native <code className="font-mono text-xs">Multicall3From</code>. Tallypay never holds keys or funds.
        </p>
      </div>

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
                  setInstructions(parsed.instructions);
                  if (parsed.PmtInfId) setRunId(parsed.PmtInfId);
                  setSent(null);
                } catch (err) {
                  setError((err as Error).message);
                }
              }}
            />
          </label>
          <button className="btn-secondary" onClick={() => download("tallypay-ledger-template.csv", instructionsToCsv(TEMPLATE))}>Download CSV template</button>
          <label className="ml-2 flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={anchor} onChange={(e) => setAnchor(e.target.checked)} /> Anchor the ledger hash on-chain
          </label>
        </div>
      </section>

      {error && <Notice tone="error">{error}</Notice>}
      {plan.error && <Notice tone="error">{plan.error}</Notice>}

      {instructions.length > 0 && (
        <section className="card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
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
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn-primary" disabled={!!busy || !!sent} onClick={send}>
              {busy ?? `Send ${plan.plan.anchor.NbOfTxs} payments in one transaction`}
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
    </div>
  );
}
