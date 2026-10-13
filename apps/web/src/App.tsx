import { useEffect, useState } from "react";
import Overview from "./pages/Overview.tsx";
import Console from "./pages/Console.tsx";
import Pay from "./pages/Pay.tsx";
import Verify from "./pages/Verify.tsx";
import type { LoadedLedger } from "./lib/ledger-io.ts";

export type Route = "overview" | "console" | "verify" | "pay";

export const REPO_URL = "https://github.com/ZhenYan1214/TallyPay";

function routeFromHash(): Route {
  const r = window.location.hash.replace(/^#\/?/, "").split("?")[0];
  return r === "console" || r === "pay" || r === "verify" ? r : "overview";
}

/** Query flags carried in the hash, e.g. #/console?demo */
export function hashFlags(): Set<string> {
  const q = window.location.hash.split("?")[1] ?? "";
  return new Set(q.split("&").filter(Boolean).map((p) => p.split("=")[0]!));
}

export function navigate(route: Route, query?: string) {
  const path = route === "overview" ? "/" : `/${route}`;
  window.location.hash = query ? `${path}?${query}` : path;
}

const NAV: Array<{ route: Route; label: string; short: string }> = [
  { route: "overview", label: "Overview", short: "Home" },
  { route: "console", label: "Reconcile", short: "Reconcile" },
  { route: "verify", label: "Verify", short: "Verify" },
  { route: "pay", label: "Pay a run", short: "Pay" },
];

export default function App() {
  const [route, setRoute] = useState<Route>(routeFromHash);
  const [handoff, setHandoff] = useState<{ ledger: LoadedLedger; autorun: boolean } | null>(null);

  useEffect(() => {
    const onHash = () => setRoute(routeFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route]);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-slate-300/80 bg-paper/95">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <button onClick={() => navigate("overview")} className="flex shrink-0 items-baseline gap-2 py-3" aria-label="Tieout home">
            <span className="display text-[27px] leading-none">Tieout</span>
            <span className="hidden font-mono text-[10.5px] tracking-[0.14em] text-slate-500 uppercase md:inline">for Arc</span>
          </button>
          <nav className="flex items-stretch gap-1 self-stretch overflow-x-auto overflow-y-hidden text-[14px] whitespace-nowrap [scrollbar-width:none] sm:gap-4">
            {NAV.map((n) => (
              <button
                key={n.route}
                onClick={() => navigate(n.route)}
                className={`-mb-px border-b-2 px-1.5 pt-1 font-medium transition-colors sm:px-1 ${route === n.route ? "border-ink text-ink" : "border-transparent text-slate-500 hover:text-ink"}`}
                aria-current={route === n.route ? "page" : undefined}
              >
                <span className="sm:hidden">{n.short}</span>
                <span className="hidden sm:inline">{n.label}</span>
              </button>
            ))}
          </nav>
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="hidden font-mono text-[11px] tracking-[0.1em] text-slate-500 uppercase transition-colors hover:text-ink sm:inline" aria-label="Source on GitHub">
            Source ↗
          </a>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        {route === "overview" && <Overview />}
        {route === "console" && <Console handoff={handoff} onHandoffUsed={() => setHandoff(null)} />}
        {route === "verify" && <Verify />}
        {route === "pay" &&
          <Pay
            onReconcile={(ledger) => {
              setHandoff({ ledger, autorun: true });
              navigate("console");
            }}
          />}
      </main>

      <footer className="border-t-[3px] border-double border-slate-400">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-7 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>Tieout is an independent open-source project built on Arc. Not affiliated with Circle.</span>
            <a className="underline decoration-slate-300 underline-offset-2 hover:text-slate-800" href={`${REPO_URL}/blob/main/docs/ARCHITECTURE.md`} target="_blank" rel="noreferrer">Architecture</a>
            <a className="underline decoration-slate-300 underline-offset-2 hover:text-slate-800" href={`${REPO_URL}/blob/main/docs/MEMO_SPEC.md`} target="_blank" rel="noreferrer">Memo spec</a>
            <a className="underline decoration-slate-300 underline-offset-2 hover:text-slate-800" href={`${REPO_URL}/blob/main/SECURITY.md`} target="_blank" rel="noreferrer">Security</a>
          </div>
          <span>Journal entries are templates for review by an accountant, not accounting or tax advice.</span>
        </div>
      </footer>
    </div>
  );
}
