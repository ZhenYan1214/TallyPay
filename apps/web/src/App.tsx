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
      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
          <button onClick={() => navigate("overview")} className="flex shrink-0 items-center gap-2.5 rounded-lg">
            <img src="./favicon.svg" alt="" className="h-7 w-7 rounded-lg shadow-sm" />
            <span className="text-[17px] font-semibold tracking-tight">Tieout</span>
            <span className="hidden rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 md:inline">for Arc</span>
          </button>
          <nav className="flex items-center gap-0.5 overflow-x-auto rounded-xl bg-slate-100/80 p-1 text-sm whitespace-nowrap">
            {NAV.map((n) => (
              <button
                key={n.route}
                onClick={() => navigate(n.route)}
                className={`rounded-lg px-2.5 py-1.5 font-medium transition sm:px-3 ${route === n.route ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
                aria-current={route === n.route ? "page" : undefined}
              >
                <span className="sm:hidden">{n.short}</span>
                <span className="hidden sm:inline">{n.label}</span>
              </button>
            ))}
          </nav>
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="btn-ghost hidden text-xs sm:inline-flex" aria-label="Source on GitHub">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 .5a12 12 0 00-3.8 23.4c.6.1.8-.3.8-.6v-2.2c-3.3.7-4-1.4-4-1.4-.6-1.4-1.4-1.8-1.4-1.8-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.9 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 016 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0012 .5z" />
            </svg>
            GitHub
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

      <footer className="hairline bg-white/60">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
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
