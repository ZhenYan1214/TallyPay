import { useState, type ReactNode } from "react";
import type { AnchorStatus, ReconStatus } from "@tieout/recon";

/* ---------- status vocabulary ---------- */

const STATUS_STYLE: Record<ReconStatus, { label: string; className: string; tick?: boolean }> = {
  matched: { label: "Matched", className: "text-emerald-700 bg-emerald-50/60", tick: true },
  matched_by_intent: { label: "By intent", className: "text-sky-700 bg-sky-50/60", tick: true },
  mismatch: { label: "Mismatch", className: "text-amber-700 bg-amber-50/70" },
  ambiguous: { label: "Ambiguous", className: "text-violet-700 bg-violet-50/70" },
  missing: { label: "Not paid", className: "text-slate-500 [border-style:dashed]" },
  duplicate: { label: "Duplicate", className: "text-rose-700 bg-rose-50/70" },
  unexpected: { label: "Unexpected", className: "text-rose-700 bg-rose-50/70" },
};

/** An accountant's tie-out mark. */
export function Tick({ className = "h-3 w-3" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2.5 8.8 6 12.2 13.6 3.6" />
    </svg>
  );
}

export const STATUS_HELP: Record<ReconStatus, string> = {
  matched: "Memo or trusted reference, counterparty, amount, token and direction agree with the ledger.",
  matched_by_intent: "No memo (e.g. sent from a Safe or MPC wallet, or a plain wallet send), but counterparty, token and amount match exactly one ledger entry.",
  mismatch: "The memo or reference points to a ledger entry, but the amount, counterparty, token or direction differ.",
  ambiguous: "No memo, and more than one way to pair this with the ledger. Tieout never guesses: settle it by hand or attach references.",
  missing: "The ledger expects this payment or receipt, but no transfer was found.",
  duplicate: "This ledger entry was settled more than once.",
  unexpected: "Money moved and the ledger has no entry for it.",
};

export function StatusBadge({ status }: { status: ReconStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span className={`stamp ${s.className}`}>
      {s.tick && <Tick className="h-2.5 w-2.5" />}
      {s.label}
    </span>
  );
}

const ANCHOR_STYLE: Record<AnchorStatus, { label: string; className: string; tick?: boolean }> = {
  verified: { label: "Anchor verified", className: "text-emerald-700 bg-emerald-50/60", tick: true },
  mismatch: { label: "Edited after anchoring", className: "text-rose-700 bg-rose-50/70" },
  absent: { label: "No anchor", className: "text-slate-500 [border-style:dashed]" },
};

export function AnchorBadge({ status }: { status: AnchorStatus }) {
  const s = ANCHOR_STYLE[status];
  return (
    <span className={`stamp ${s.className}`}>
      {s.tick && <Tick className="h-2.5 w-2.5" />}
      {s.label}
    </span>
  );
}

/* ---------- numbers ---------- */

/** "1.490000" -> "1.49", "1234.5" -> "1,234.5", keeps up to 6 decimals, never scientific. */
export function fmt(amount: string | number | bigint | undefined, maxDecimals = 6): string {
  if (amount === undefined) return "—";
  const s = typeof amount === "bigint" ? amount.toString() : String(amount);
  const neg = s.startsWith("-");
  const [whole = "0", frac = ""] = s.replace("-", "").split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const f = frac.slice(0, maxDecimals).replace(/0+$/, "");
  return `${neg ? "−" : ""}${grouped}${f ? "." + f : ""}`;
}

/* ---------- layout pieces ---------- */

export function PageHeader({ eyebrow, title, lead, aside }: { eyebrow?: string; title: string; lead?: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="page-title mt-1">{title}</h1>
        {lead && <p className="lead">{lead}</p>}
      </div>
      {aside}
    </div>
  );
}

export function Field({ label, hint, children, className = "" }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function Collapsible({ title, summary, defaultOpen = false, children }: { title: string; summary?: ReactNode; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-[4px] border border-slate-300/80 bg-white/50">
      <button type="button" className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="text-sm font-semibold text-slate-800">{title}</span>
        <span className="flex items-center gap-3 text-xs text-slate-500">
          {summary}
          <svg className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <path d="M5 8l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
      {open && <div className="border-t border-slate-300/80 px-4 py-4">{children}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, tone = "default" }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "default" | "good" | "warn" | "bad" }) {
  const toneClass = { default: "text-slate-900", good: "text-emerald-700", warn: "text-amber-700", bad: "text-rose-700" }[tone];
  return (
    <div className="card p-4">
      <div className="label mb-0">{label}</div>
      <div className={`nums mt-2 font-mono text-[24px] leading-none font-medium tracking-[-0.02em] ${toneClass}`}>{value}</div>
      {hint && <div className="mt-2.5 text-xs leading-relaxed text-slate-500">{hint}</div>}
    </div>
  );
}

export function ExternalLink({ href, children, className = "" }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`text-slate-700 underline decoration-slate-300 underline-offset-[3px] transition hover:text-slate-950 hover:decoration-slate-600 ${className}`}
    >
      {children}
    </a>
  );
}

const NOTICE = {
  info: { cls: "border-l-sky-600 text-slate-800 [&>svg]:text-sky-600", icon: "M10 7v4m0 3h.01M18 10a8 8 0 11-16 0 8 8 0 0116 0z" },
  warn: { cls: "border-l-amber-600 text-slate-800 [&>svg]:text-amber-600", icon: "M10 6v4m0 3h.01M4.5 16h11a1.5 1.5 0 001.3-2.25l-5.5-9.5a1.5 1.5 0 00-2.6 0l-5.5 9.5A1.5 1.5 0 004.5 16z" },
  error: { cls: "border-l-rose-600 text-slate-800 [&>svg]:text-rose-600", icon: "M7 7l6 6m0-6l-6 6M18 10a8 8 0 11-16 0 8 8 0 0116 0z" },
  success: { cls: "border-l-emerald-600 text-slate-800 [&>svg]:text-emerald-600", icon: "M6.5 10.5l2.5 2.5 4.5-5M18 10a8 8 0 11-16 0 8 8 0 0116 0z" },
};

export function Notice({ tone = "info", children }: { tone?: keyof typeof NOTICE; children: ReactNode }) {
  const n = NOTICE[tone];
  return (
    <div className={`flex gap-3 rounded-[3px] border border-l-[3px] border-slate-300/80 bg-white px-4 py-3 text-sm leading-relaxed ${n.cls}`} role={tone === "error" ? "alert" : undefined}>
      <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
        <path d={n.icon} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function ProgressBar({ value, label }: { value: number | null; label?: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-[3px] w-44 overflow-hidden bg-slate-300/70">
        <div className={`h-full bg-emerald-600 transition-all ${value === null ? "w-1/3 animate-pulse" : ""}`} style={value === null ? undefined : { width: `${value}%` }} />
      </div>
      {label && <span className="text-xs text-slate-500">{label}</span>}
    </div>
  );
}

export function EmptyState({ title, body, children }: { title: string; body?: ReactNode; children?: ReactNode }) {
  return (
    <div className="ruled flex flex-col items-center gap-2 rounded-[4px] border border-slate-300/80 px-6 py-14 text-center">
      <div className="display text-[26px] leading-tight">{title}</div>
      {body && <div className="max-w-md text-sm text-slate-500">{body}</div>}
      {children && <div className="mt-2">{children}</div>}
    </div>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn-ghost text-xs"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1400);
        });
      }}
    >
      {done ? "Copied" : label}
    </button>
  );
}

/** A hash or address shortened for display, with the full value on hover and a click-to-copy. */
export function Mono({ value, href, head = 6, tail = 4 }: { value: string; href?: string; head?: number; tail?: number }) {
  const short = value.length <= head + tail + 2 ? value : `${value.slice(0, head + 2)}…${value.slice(-tail)}`;
  const inner = <span className="font-mono text-xs" title={value}>{short}</span>;
  return href ? <ExternalLink href={href}>{inner}</ExternalLink> : inner;
}
