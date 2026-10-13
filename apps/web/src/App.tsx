import { useEffect, useState } from "react";
import Overview from "./pages/Overview.tsx";
import Console from "./pages/Console.tsx";
import Pay from "./pages/Pay.tsx";
import Verify from "./pages/Verify.tsx";
import type { LoadedLedger } from "./lib/ledger-io.ts";

export type Route = "overview" | "console" | "verify" | "pay";

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

const NAV: Array<{ route: Route; label: string }> = [
  { route: "overview", label: "Overview" },
  { route: "console", label: "Reconcile" },
  { route: "verify", label: "Verify" },
  { route: "pay", label: "Pay a run" },
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
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <button onClick={() => navigate("overview")} className="flex items-center gap-2">
            <img src="./favicon.svg" alt="" className="h-7 w-7" />
            <span className="text-lg font-semibold tracking-tight">Tallypay</span>
            <span className="hidden rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 sm:inline">for Arc</span>
          </button>
          <nav className="flex gap-1 text-sm">
            {NAV.map((n) => (
              <button
                key={n.route}
                onClick={() => navigate(n.route)}
                className={`rounded-lg px-2.5 py-1.5 font-medium transition sm:px-3 ${route === n.route ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}
              >
                {n.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
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

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-4 text-xs text-slate-500 sm:flex-row sm:justify-between">
          <span>Tallypay is an independent open-source project built on Arc. Not affiliated with Circle.</span>
          <span>Journal entries are templates for review by an accountant, not accounting or tax advice.</span>
        </div>
      </footer>
    </div>
  );
}
