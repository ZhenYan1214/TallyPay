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
    ["status", "EndToEndId", "PmtInfId", "payee", "ledger_recipient", "ledger_amount", "token", "chain_recipient", "chain_amount", "tx_hash", "explorer", "block", "timestamp_utc", "memo_EndToEndId", "notes"],
  ];
  for (const item of report.items) {
    const t = item.transfer;
    const memo = t?.memo?.decoded.kind === "payment" ? t.memo.decoded.memo.EndToEndId : "";
    rows.push([
      item.status,
      item.instruction?.EndToEndId,
      item.instruction?.PmtInfId,
      item.instruction?.payeeName,
      item.instruction?.recipient,
      item.instruction?.amount,
      item.instruction?.token ?? t?.token,
      t?.to,
      t ? fromUnits(t.amount) : undefined,
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
