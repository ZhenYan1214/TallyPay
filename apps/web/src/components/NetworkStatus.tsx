import { useEffect, useState } from "react";

const MAINNET_RPC = "https://rpc.mainnet.arc.io";
const POLL_MS = 15_000;

/**
 * Latest Arc mainnet block, read with one plain JSON-RPC call so the landing
 * page does not need the chain client. Shows nothing until the first answer,
 * and goes quiet if the RPC is unreachable rather than showing an error.
 */
export function NetworkStatus() {
  const [block, setBlock] = useState<number | null>(null);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    let alive = true;
    async function poll() {
      try {
        const res = await fetch(MAINNET_RPC, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
        });
        const json = (await res.json()) as { result?: string };
        if (alive && json.result) {
          setBlock(parseInt(json.result, 16));
          setStale(false);
        }
      } catch {
        if (alive) setStale(true);
      }
    }
    void poll();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void poll();
    }, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  if (block === null) return null;
  return (
    <span
      className="mr-1 hidden items-center gap-2 rounded-md border border-slate-200 px-2 py-1 font-mono text-[11.5px] text-slate-500 lg:inline-flex"
      title={stale ? "Last block seen; the public RPC is not answering right now" : "Latest Arc mainnet block, refreshed every 15 seconds"}
    >
      <span className="relative inline-flex h-1.5 w-1.5" aria-hidden>
        {!stale && <span className="ping-soft absolute inset-0 rounded-full bg-emerald-400" />}
        <span className={`relative h-1.5 w-1.5 rounded-full ${stale ? "bg-slate-300" : "bg-emerald-500"}`} />
      </span>
      <span className="font-sans text-slate-600">Arc mainnet</span>
      <span className="nums">#{block.toLocaleString("en-US")}</span>
    </span>
  );
}
