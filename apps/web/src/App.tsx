import { lazy, Suspense, useEffect, useState } from "react";
import Overview from "./pages/Overview.tsx";
import { NetworkStatus } from "./components/NetworkStatus.tsx";
import type { LoadedLedger } from "./lib/ledger-io.ts";

// The working pages carry the chain client; load them only when visited so the landing page stays light.
const Console = lazy(() => import("./pages/Console.tsx"));
const Pay = lazy(() => import("./pages/Pay.tsx"));
const Verify = lazy(() => import("./pages/Verify.tsx"));

const TITLES: Record<string, string> = {
  overview: "Tieout · Reconciliation for USDC on Arc",
  console: "Reconcile · Tieout",
  verify: "Verify a payment · Tieout",
  pay: "Pay a run · Tieout",
};

function PageFallback() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <div className="h-4 w-32 animate-pulse rounded bg-slate-200" />
      <div className="h-8 w-80 max-w-full animate-pulse rounded bg-slate-200" />
      <div className="h-40 animate-pulse rounded-[10px] bg-slate-200/70" />
    </div>
  );
}

export type Route = "overview" | "console" | "verify" | "pay";

export const REPO_URL = "https://github.com/ZhenYan1214/Tieout_arc";

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
    document.title = TITLES[route] ?? TITLES.overview!;
  }, [route]);

  // The reconcile view is a wide data table; everything else reads better at a narrower measure.
  const width = route === "console" ? "max-w-[1320px]" : "max-w-6xl";

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
        <div className={`mx-auto flex h-14 ${width} items-center justify-between gap-3 px-4 sm:px-6`}>
          <button onClick={() => navigate("overview")} className="flex shrink-0 items-center gap-2.5 rounded-lg">
            <img src="./favicon.svg" alt="" className="h-6 w-6 rounded-md" />
            <span className="text-[16px] font-semibold tracking-[-0.02em]">Tieout</span>
            <span className="hidden text-[13px] text-slate-400 md:inline">for Arc</span>
          </button>
          <nav className="flex h-full items-stretch gap-1 overflow-x-auto overflow-y-hidden text-[13.5px] whitespace-nowrap [scrollbar-width:none] sm:gap-5">
            {NAV.map((n) => (
              <button
                key={n.route}
                onClick={() => navigate(n.route)}
                className={`-mb-px border-b-2 px-1.5 font-medium transition-colors sm:px-0.5 ${route === n.route ? "border-ink text-ink" : "border-transparent text-slate-500 hover:text-slate-900"}`}
                aria-current={route === n.route ? "page" : undefined}
              >
                <span className="sm:hidden">{n.short}</span>
                <span className="hidden sm:inline">{n.label}</span>
              </button>
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-1">
          <NetworkStatus />
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="btn-ghost hidden text-xs sm:inline-flex" aria-label="Source on GitHub">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 .5a12 12 0 00-3.8 23.4c.6.1.8-.3.8-.6v-2.2c-3.3.7-4-1.4-4-1.4-.6-1.4-1.4-1.8-1.4-1.8-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.9 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 016 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0012 .5z" />
            </svg>
            GitHub
          </a>
          </div>
        </div>
      </header>

      <main className={`mx-auto w-full ${width} flex-1 px-4 py-8 sm:px-6 sm:py-10`}>
        {route === "overview" && <Overview />}
        <Suspense fallback={<PageFallback />}>
          {route === "console" && <Console handoff={handoff} onHandoffUsed={() => setHandoff(null)} />}
          {route === "verify" && <Verify />}
          {route === "pay" &&
            <Pay
              onReconcile={(ledger) => {
                setHandoff({ ledger, autorun: true });
                navigate("console");
              }}
            />}
        </Suspense>
      </main>

      <footer className="mt-16 border-t border-slate-200 bg-white">
        <div className={`mx-auto ${width} px-4 py-10 sm:px-6`}>
          <div className="grid gap-10 sm:grid-cols-[1.4fr_1fr_1fr]">
            <div>
              <div className="flex items-center gap-2">
                <img src="./favicon.svg" alt="" className="h-5 w-5 rounded-[5px]" />
                <span className="text-[15px] font-semibold tracking-[-0.02em]">Tieout</span>
              </div>
              <p className="mt-3 max-w-xs text-[13px] leading-relaxed text-slate-500">
                Reconciliation for USDC on Arc. An independent open-source project, not affiliated with Circle.
              </p>
            </div>
            <div>
              <div className="text-[12.5px] font-medium text-slate-900">Product</div>
              <ul className="mt-3 space-y-2 text-[13px] text-slate-500">
                {NAV.filter((n) => n.route !== "overview").map((n) => (
                  <li key={n.route}>
                    <button className="transition-colors hover:text-slate-900" onClick={() => navigate(n.route)}>{n.label}</button>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="text-[12.5px] font-medium text-slate-900">Docs</div>
              <ul className="mt-3 space-y-2 text-[13px] text-slate-500">
                {[
                  ["Source on GitHub", REPO_URL],
                  ["Architecture", `${REPO_URL}/blob/main/docs/ARCHITECTURE.md`],
                  ["Memo spec", `${REPO_URL}/blob/main/docs/MEMO_SPEC.md`],
                  ["Security", `${REPO_URL}/blob/main/SECURITY.md`],
                ].map(([label, href]) => (
                  <li key={label}>
                    <a className="transition-colors hover:text-slate-900" href={href} target="_blank" rel="noreferrer">{label}</a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="mt-10 flex flex-col gap-2 border-t border-slate-100 pt-6 text-[12px] text-slate-400 sm:flex-row sm:justify-between">
            <span>Apache-2.0</span>
            <span>Journal entries are templates for review by an accountant, not accounting or tax advice.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
