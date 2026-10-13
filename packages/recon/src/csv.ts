import { fromUnits, toUnits } from "@tallypay/sdk";
import type { JournalEntry } from "./journal.js";
import type { ReconReport } from "./reconcile.js";

function cell(value: string | number | undefined): string {
  const text = value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows: Array<Array<string | number | undefined>>): string {
  return rows.map((row) => row.map(cell).join(",")).join("\n") + "\n";
}

/** One row per reconciliation item, for review and audit files. */
export function reconReportCsv(report: ReconReport, explorerUrl: string): string {
  const rows: Array<Array<string | number | undefined>> = [
    ["status", "direction", "EndToEndId", "PmtInfId", "payee", "ledger_counterparty", "ledger_amount", "token", "chain_counterparty", "chain_amount", "variance", "native", "tx_hash", "explorer", "block", "timestamp_utc", "memo_EndToEndId", "notes"],
  ];
  for (const item of report.items) {
    const t = item.transfer;
    const memo = t?.memo?.decoded.kind === "payment" ? t.memo.decoded.memo.EndToEndId : "";
    rows.push([
      item.status,
      item.direction,
      item.instruction?.EndToEndId,
      item.instruction?.PmtInfId,
      item.instruction?.payeeName,
      item.direction === "in" ? item.instruction?.payer : item.instruction?.recipient,
      item.instruction?.amount,
      item.instruction?.token ?? t?.token,
      item.direction === "in" ? t?.from : t?.to,
      t ? fromUnits(t.amount) : undefined,
      item.varianceUnits !== undefined ? fromUnits(item.varianceUnits) : undefined,
      t?.native ? "yes" : "",
      t?.txHash,
      t ? `${explorerUrl}/tx/${t.txHash}` : undefined,
      t ? t.blockNumber.toString() : undefined,
      t ? new Date(t.timestamp * 1000).toISOString() : undefined,
      memo,
      item.notes.join("; "),
    ]);
  }
  return toCsv(rows);
}

/** Generic double-entry journal, one row per line. */
export function journalCsv(entries: JournalEntry[]): string {
  const rows: Array<Array<string | number | undefined>> = [
    ["date", "reference", "narration", "account", "account_name", "debit", "credit", "currency", "status", "tx_hash"],
  ];
  for (const entry of entries) {
    for (const l of entry.lines) {
      rows.push([entry.date, entry.reference, entry.narration, l.account, l.accountName, l.debit, l.credit, entry.currency, entry.status, entry.txHash]);
    }
  }
  return toCsv(rows);
}

/**
 * Xero "Import manual journals" CSV. Amounts are positive for debits and
 * negative for credits, rounded to 2 decimals. Only base-currency (USDC)
 * entries are included; EURC entries need an FX rate first.
 */
export function xeroManualJournalCsv(entries: JournalEntry[], taxRate = "Tax Exempt"): string {
  const rows: Array<Array<string | number | undefined>> = [
    ["*Narration", "*Date", "Description", "*AccountCode", "*TaxRate", "*Amount", "TrackingName1", "TrackingOption1"],
  ];
  for (const entry of entries) {
    if (entry.currency !== "USDC") continue;
    const [y, m, d] = entry.date.split("-");
    for (const l of entry.lines) {
      const isDebit = toUnits(l.debit) > 0n;
      // Round the magnitude half-up in integer cents so debit and credit lines stay symmetric.
      const cents = (toUnits(isDebit ? l.debit : l.credit) + 5_000n) / 10_000n;
      if (cents === 0n) continue;
      const amount = `${isDebit ? "" : "-"}${cents / 100n}.${(cents % 100n).toString().padStart(2, "0")}`;
      rows.push([entry.narration, `${d}/${m}/${y}`, entry.txHash ?? entry.reference, l.account, taxRate, amount, "Arc tx", entry.reference]);
    }
  }
  return toCsv(rows);
}

/**
 * QuickBooks Online "Import journal entries" CSV. QBO matches on account
 * NAME, not code; dates are MM/dd/yyyy; every journal must balance.
 * Create the accounts first (USDC wallet as Other Current Asset, Payouts
 * payable as Other Current Liability, Receivables as Other Current Asset),
 * or rename them in ChartOfAccounts to match your own.
 */
export function qboJournalCsv(entries: JournalEntry[]): string {
  const rows: Array<Array<string | number | undefined>> = [
    ["*JournalNo", "*JournalDate", "*AccountName", "Debits", "Credits", "Description", "Name", "Currency"],
  ];
  for (const entry of entries) {
    const [y, m, d] = entry.date.split("-");
    for (const l of entry.lines) {
      const debit = toUnits(l.debit);
      const credit = toUnits(l.credit);
      const cents = (v: bigint) => {
        const c = (v + 5_000n) / 10_000n;
        return `${c / 100n}.${(c % 100n).toString().padStart(2, "0")}`;
      };
      if (debit === 0n && credit === 0n) continue;
      rows.push([
        entry.reference,
        `${m}/${d}/${y}`,
        l.accountName,
        debit > 0n ? cents(debit) : "",
        credit > 0n ? cents(credit) : "",
        `${entry.narration}${entry.txHash ? ` · ${entry.txHash}` : ""}`,
        "",
        entry.currency === "EURC" ? "EUR" : "USD",
      ]);
    }
  }
  return toCsv(rows);
}
