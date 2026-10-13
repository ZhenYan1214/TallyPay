import type { PayoutInstruction, PayoutRunLedger, TokenSymbol } from "@tallypay/sdk";

export type LoadedLedger = PayoutRunLedger & {
  /** Frozen chain scan to fall back on when the public RPC fails (demos only). */
  snapshotUrl?: string;
  scan?: { fromBlock: string; toBlock: string };
  scenario?: Record<string, string>;
};

export const CSV_COLUMNS = ["EndToEndId", "recipient", "amount", "token", "Purp", "CdtrRef", "Ustrd", "payeeName", "payeeCountry"] as const;

/** Minimal RFC 4180 parser: quoted fields, escaped quotes, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((v) => v.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  row.push(field);
  if (row.some((v) => v.trim() !== "")) rows.push(row);
  return rows;
}

export function instructionsFromCsv(text: string): PayoutInstruction[] {
  const [header, ...body] = parseCsv(text);
  if (!header) throw new Error("CSV is empty");
  const index = (name: string) => header.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase());
  for (const required of ["EndToEndId", "recipient", "amount"]) {
    if (index(required) < 0) throw new Error(`CSV is missing the "${required}" column`);
  }
  const get = (row: string[], name: string) => {
    const i = index(name);
    const value = i >= 0 ? row[i]?.trim() : undefined;
    return value ? value : undefined;
  };
  return body.map((row) => ({
    EndToEndId: get(row, "EndToEndId")!,
    recipient: get(row, "recipient") as `0x${string}`,
    amount: get(row, "amount")!,
    token: ((get(row, "token") ?? "USDC").toUpperCase() as TokenSymbol),
    Purp: get(row, "Purp"),
    CdtrRef: get(row, "CdtrRef"),
    Ustrd: get(row, "Ustrd"),
    payeeName: get(row, "payeeName"),
    payeeCountry: get(row, "payeeCountry"),
  }));
}

export function instructionsToCsv(instructions: PayoutInstruction[]): string {
  const esc = (v: string | undefined) => (v === undefined ? "" : /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [CSV_COLUMNS.join(",")];
  for (const i of instructions) lines.push(CSV_COLUMNS.map((c) => esc(i[c] as string | undefined)).join(","));
  return lines.join("\n") + "\n";
}

export async function readLedgerFile(file: File): Promise<Partial<LoadedLedger> & { instructions: PayoutInstruction[] }> {
  const text = await file.text();
  if (file.name.toLowerCase().endsWith(".json")) {
    const parsed = JSON.parse(text) as LoadedLedger;
    if (!Array.isArray(parsed.instructions)) throw new Error("JSON ledger needs an instructions array");
    return parsed;
  }
  return { instructions: instructionsFromCsv(text) };
}

export function download(filename: string, content: string, type = "text/csv") {
  const blob = new Blob([content], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function shortHash(value: string, head = 6, tail = 4): string {
  return value.length <= head + tail + 2 ? value : `${value.slice(0, head + 2)}…${value.slice(-tail)}`;
}
