import { useState, type ReactNode } from "react";
import type { AnchorStatus, ReconStatus } from "@tieout/recon";

/* ---------- status vocabulary ---------- */

const STATUS_STYLE: Record<ReconStatus, { label: string; className: string }> = {
  matched: { label: "Matched", className: "bg-emerald-50 text-emerald-700 ring-emerald-600/15" },
  matched_by_intent: { label: "Matched by intent", className: "bg-sky-50 text-sky-700 ring-sky-600/15" },
  mismatch: { label: "Mismatch", className: "bg-amber-50 text-amber-800 ring-amber-600/20" },
  ambiguous: { label: "Ambiguous", className: "bg-violet-50 text-violet-700 ring-violet-600/15" },
  missing: { label: "Not paid", className: "bg-slate-50 text-slate-600 ring-slate-500/20" },
  duplicate: { label: "Duplicate", className: "bg-rose-50 text-rose-700 ring-rose-600/15" },
  unexpected: { label: "Unexpected", className: "bg-rose-50 text-rose-700 ring-rose-600/15" },
};

const TAG = "inline-flex items-center rounded-md px-1.5 py-0.5 text-[12px] leading-4 font-medium whitespace-nowrap ring-1 ring-inset";

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
    <span className={`${TAG} ${s.className}`}>{s.label}</span>
  );
}

const ANCHOR_STYLE: Record<AnchorStatus, { label: string; className: string }> = {
  verified: { label: "Anchor verified", className: "bg-emerald-50 text-emerald-700 ring-emerald-600/15" },
  mismatch: { label: "Ledger changed after anchoring", className: "bg-rose-50 text-rose-700 ring-rose-600/15" },
  absent: { label: "No anchor", className: "bg-slate-50 text-slate-600 ring-slate-500/20" },
};

export function AnchorBadge({ status }: { status: AnchorStatus }) {
  const s = ANCHOR_STYLE[status];
  return (
    <span className={`${TAG} ${s.className}`}>{s.label}</span>
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
        {eyebrow && (
          <p className="eyebrow">
            <span className="text-slate-400">Tieout</span>
            <span className="mx-1.5 text-slate-300">/</span>
            {eyebrow}
          </p>
        )}
        <h1 className="page-title mt-2">{title}</h1>
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
    <div className="rounded-[10px] border border-slate-200 bg-white">
      <button type="button" className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="text-[13.5px] font-medium text-slate-800">{title}</span>
        <span className="flex items-center gap-3 text-xs text-slate-500">
          {summary}
          <svg className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <path d="M5 8l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
      {open && <div className="border-t border-slate-200 px-4 py-4">{children}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, tone = "default" }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "default" | "good" | "warn" | "bad" }) {
  const toneClass = { default: "text-slate-900", good: "text-emerald-700", warn: "text-amber-700", bad: "text-rose-700" }[tone];
  return (
    <div className="bg-white p-4 sm:p-5">
      <div className="text-[12.5px] font-medium text-slate-500">{label}</div>
      <div className={`nums mt-2 text-[24px] leading-none font-semibold tracking-[-0.02em] ${toneClass}`}>{value}</div>
      {hint && <div className="mt-2 text-xs leading-relaxed text-slate-500">{hint}</div>}
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
  info: { cls: "border-sky-200/70 bg-sky-50/50 text-slate-700 [&>svg]:text-sky-600", icon: "M10 7v4m0 3h.01M18 10a8 8 0 11-16 0 8 8 0 0116 0z" },
  warn: { cls: "border-amber-200/80 bg-amber-50/60 text-slate-700 [&>svg]:text-amber-600", icon: "M10 6v4m0 3h.01M4.5 16h11a1.5 1.5 0 001.3-2.25l-5.5-9.5a1.5 1.5 0 00-2.6 0l-5.5 9.5A1.5 1.5 0 004.5 16z" },
  error: { cls: "border-rose-200/80 bg-rose-50/60 text-slate-800 [&>svg]:text-rose-600", icon: "M7 7l6 6m0-6l-6 6M18 10a8 8 0 11-16 0 8 8 0 0116 0z" },
  success: { cls: "border-emerald-200/70 bg-emerald-50/50 text-slate-700 [&>svg]:text-emerald-600", icon: "M6.5 10.5l2.5 2.5 4.5-5M18 10a8 8 0 11-16 0 8 8 0 0116 0z" },
};

export function Notice({ tone = "info", children }: { tone?: keyof typeof NOTICE; children: ReactNode }) {
  const n = NOTICE[tone];
  return (
    <div className={`flex gap-2.5 rounded-lg border px-3.5 py-3 text-[13.5px] leading-relaxed ${n.cls}`} role={tone === "error" ? "alert" : undefined}>
      <svg className="mt-[3px] h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
        <path d={n.icon} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function ProgressBar({ value, label }: { value: number | null; label?: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-1 w-44 overflow-hidden rounded-full bg-slate-200">
        <div className={`h-full rounded-full bg-ink transition-all ${value === null ? "w-1/3 animate-pulse" : ""}`} style={value === null ? undefined : { width: `${value}%` }} />
      </div>
      {label && <span className="text-xs text-slate-500">{label}</span>}
    </div>
  );
}

export function EmptyState({ title, body, children }: { title: string; body?: ReactNode; children?: ReactNode }) {
  return (
    <div className="card-quiet flex flex-col items-center gap-2 px-6 py-12 text-center">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400">
        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
          <path d="M4 5h12M4 10h12M4 15h7" strokeLinecap="round" />
        </svg>
      </div>
      <div className="mt-1 text-[14px] font-medium text-slate-800">{title}</div>
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
  const inner = <span className="font-mono text-[12px] whitespace-nowrap" title={value}>{short}</span>;
  return href ? <ExternalLink href={href}>{inner}</ExternalLink> : inner;
}
