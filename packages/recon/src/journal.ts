import { formatUnits } from "viem";
import { fromUnits, type TokenSymbol } from "@tieout/sdk";
import type { ReconItem, ReconReport } from "./reconcile.js";

/**
 * Account codes used when generating journal entries. Defaults follow a
 * generic small-business chart of accounts; map them to your own codes.
 */
export interface ChartOfAccounts {
  usdcWallet: string;
  eurcWallet: string;
  payable: string;
  receivable: string;
  networkFees: string;
  suspense: string;
}

export const DEFAULT_ACCOUNTS: ChartOfAccounts = {
  usdcWallet: "1015",
  eurcWallet: "1016",
  payable: "2110",
  receivable: "1210",
  networkFees: "6810",
  suspense: "1999",
};

export const ACCOUNT_NAMES: Record<keyof ChartOfAccounts, string> = {
  usdcWallet: "USDC wallet (Arc)",
  eurcWallet: "EURC wallet (Arc)",
  payable: "Payouts payable",
  receivable: "Receivables (USDC invoices)",
  networkFees: "Network fees",
  suspense: "Suspense: unreconciled",
};

export interface JournalLine {
  account: string;
  accountName: string;
  /** Decimal string; exactly one of debit/credit is non-zero. */
  debit: string;
  credit: string;
}

export interface JournalEntry {
  date: string;
  narration: string;
  currency: TokenSymbol;
  reference: string;
  txHash?: string;
  status: string;
  lines: JournalLine[];
}

function line(accounts: ChartOfAccounts, key: keyof ChartOfAccounts, side: "debit" | "credit", amount: string): JournalLine {
  return {
    account: accounts[key],
    accountName: ACCOUNT_NAMES[key],
    debit: side === "debit" ? amount : "0",
    credit: side === "credit" ? amount : "0",
  };
}

function walletKey(token: TokenSymbol): keyof ChartOfAccounts {
  return token === "EURC" ? "eurcWallet" : "usdcWallet";
}

function dateOf(timestamp: number): string {
  return new Date(timestamp * 1000).toISOString().slice(0, 10);
}

/**
 * Payouts: debit Payouts payable, credit the wallet. Receipts: debit the
 * wallet, credit Receivables. Anything unreconciled goes against Suspense
 * on the side that keeps the wallet account true to the chain.
 */
function entryForItem(item: ReconItem, accounts: ChartOfAccounts): JournalEntry | undefined {
  const t = item.transfer;
  if (!t) return undefined; // "missing" items have nothing to book yet.
  const amount = fromUnits(t.amount);
  const reference = item.instruction?.EndToEndId ?? (t.memo?.decoded.kind === "payment" ? t.memo.decoded.memo.EndToEndId : t.txHash.slice(0, 10));
  const cleared = item.status === "matched" || item.status === "matched_by_intent";
  const run = item.instruction?.PmtInfId ? ` · run ${item.instruction.PmtInfId}` : "";
  const payee = item.instruction?.payeeName ? ` · ${item.instruction.payeeName}` : "";
  const wallet = walletKey(t.token);
  const other: keyof ChartOfAccounts = cleared ? (item.direction === "in" ? "receivable" : "payable") : "suspense";
  const narration = cleared
    ? `${item.direction === "in" ? "Receipt" : "Payout"} ${reference}${run}${payee}`
    : `Unreconciled ${item.status} ${item.direction === "in" ? "receipt" : "payment"} ${reference}${run}: review required`;
  const lines =
    item.direction === "in"
      ? [line(accounts, wallet, "debit", amount), line(accounts, other, "credit", amount)]
      : [line(accounts, other, "debit", amount), line(accounts, wallet, "credit", amount)];
  return { date: dateOf(t.timestamp), narration, currency: t.token, reference, txHash: t.txHash, status: item.status, lines };
}

/**
 * Network fees are tiny (fractions of a cent), so they are booked once per
 * day rather than per transaction. Fees are paid in USDC (18-decimal native
 * units) and rounded to 6 decimals here.
 */
function feeEntries(report: ReconReport, feesByDay: Map<string, bigint>, accounts: ChartOfAccounts): JournalEntry[] {
  return [...feesByDay.entries()].map(([date, wei]) => {
    const amount = formatUnits((wei + 500_000_000_000n) / 1_000_000_000_000n, 6);
    return {
      date,
      narration: `Arc network fees · ${report.account}`,
      currency: "USDC" as const,
      reference: `FEES-${date}`,
      status: "fee",
      lines: [line(accounts, "networkFees", "debit", amount), line(accounts, "usdcWallet", "credit", amount)],
    };
  });
}

export interface FeeInput {
  timestamp: number;
  feeWei: bigint;
}

/**
 * Turns a reconciliation report into double-entry journal entries.
 * These are templates for an accountant to review, not tax or accounting advice.
 */
export function buildJournal(report: ReconReport, fees: FeeInput[], accounts: ChartOfAccounts = DEFAULT_ACCOUNTS): JournalEntry[] {
  const entries = report.items.map((item) => entryForItem(item, accounts)).filter((e): e is JournalEntry => !!e);
  const feesByDay = new Map<string, bigint>();
  for (const fee of fees) {
    const day = dateOf(fee.timestamp);
    feesByDay.set(day, (feesByDay.get(day) ?? 0n) + fee.feeWei);
  }
  return [...entries, ...feeEntries(report, feesByDay, accounts)].sort(
    (a, b) => a.date.localeCompare(b.date) || a.reference.localeCompare(b.reference),
  );
}
