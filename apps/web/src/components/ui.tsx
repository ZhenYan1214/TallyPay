import type { ReactNode } from "react";
import type { AnchorStatus, ReconStatus } from "@tallypay/recon";

const STATUS_STYLE: Record<ReconStatus, { label: string; className: string }> = {
  matched: { label: "Matched", className: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  matched_by_intent: { label: "Matched by intent", className: "bg-sky-50 text-sky-700 ring-sky-200" },
  mismatch: { label: "Mismatch", className: "bg-amber-50 text-amber-800 ring-amber-200" },
  missing: { label: "Not paid", className: "bg-slate-100 text-slate-700 ring-slate-300" },
  duplicate: { label: "Duplicate", className: "bg-rose-50 text-rose-700 ring-rose-200" },
  unexpected: { label: "Unexpected", className: "bg-rose-50 text-rose-700 ring-rose-200" },
};

export const STATUS_HELP: Record<ReconStatus, string> = {
  matched: "Memo, recipient, amount and token agree with the ledger.",
  matched_by_intent: "No memo (e.g. sent from a Safe or MPC wallet, or a plain wallet send), but counterparty, token and amount match a ledger entry.",
  mismatch: "The memo points to a ledger entry, but the amount, recipient or token differ.",
  missing: "The ledger expects this payment, but no transfer was found.",
  duplicate: "This ledger entry was paid more than once.",
  unexpected: "Money moved and the ledger has no entry for it.",
};

export function StatusBadge({ status }: { status: ReconStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset ${s.className}`}>
      {s.label}
    </span>
  );
}

const ANCHOR_STYLE: Record<AnchorStatus, { label: string; className: string }> = {
  verified: { label: "Anchor verified", className: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  mismatch: { label: "Ledger changed after anchoring", className: "bg-rose-50 text-rose-700 ring-rose-200" },
  absent: { label: "No anchor", className: "bg-slate-100 text-slate-600 ring-slate-300" },
};

export function AnchorBadge({ status }: { status: AnchorStatus }) {
  const s = ANCHOR_STYLE[status];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${s.className}`}>{s.label}</span>
  );
}

export function Stat({ label, value, hint, tone = "default" }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "default" | "good" | "warn" | "bad" }) {
  const toneClass = { default: "text-slate-900", good: "text-emerald-700", warn: "text-amber-700", bad: "text-rose-700" }[tone];
  return (
    <div className="card p-4">
      <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

export function ExternalLink({ href, children, className = "" }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={`text-slate-700 underline decoration-slate-300 underline-offset-2 hover:text-slate-950 hover:decoration-slate-500 ${className}`}>
      {children}
    </a>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "error" | "warn"; children: ReactNode }) {
  const cls = {
    info: "border-sky-200 bg-sky-50 text-sky-900",
    warn: "border-amber-200 bg-amber-50 text-amber-900",
    error: "border-rose-200 bg-rose-50 text-rose-900",
  }[tone];
  return <div className={`rounded-lg border px-4 py-3 text-sm ${cls}`}>{children}</div>;
}
