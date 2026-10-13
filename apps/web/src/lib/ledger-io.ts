import type { PayoutInstruction, PayoutRunLedger, TokenSymbol } from "@tieout/sdk";

export type LoadedLedger = PayoutRunLedger & {
  /** Frozen chain scan to fall back on when the public RPC fails (demos only). */
  snapshotUrl?: string;
  /** EOAs that publish on-chain references for this wallet's payments (e.g. an ops wallet attesting a Safe's payouts). */
  memoSigners?: string[];
  scan?: { fromBlock: string; toBlock: string };
  scenario?: Record<string, string>;
};

export const CSV_COLUMNS = ["EndToEndId", "direction", "recipient", "payer", "amount", "token", "Purp", "CdtrRef", "Ustrd", "payeeName", "payeeCountry"] as const;

/** Excel on some locales exports with semicolons or tabs; pick whatever the header line uses. */
export function detectDelimiter(text: string): string {
  const header = text.split(/\r?\n/, 1)[0] ?? "";
  const counts: Array<[string, number]> = [",", ";", "\t"].map((d) => [d, header.split(d).length - 1]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0]![1] > 0 ? counts[0]![0] : ",";
}

/** Minimal RFC 4180 parser: quoted fields, escaped quotes, CRLF, a UTF-8 BOM, and , ; or tab delimiters. */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, "");
  const delimiter = detectDelimiter(text);
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
    else if (c === delimiter) {
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
    direction: (get(row, "direction")?.toLowerCase() === "in" ? "in" : "out") as "in" | "out",
    recipient: get(row, "recipient") as `0x${string}`,
    payer: get(row, "payer") as `0x${string}` | undefined,
    amount: normalizeAmount(get(row, "amount")!),
    token: ((get(row, "token") ?? "USDC").toUpperCase() as TokenSymbol),
    Purp: get(row, "Purp"),
    CdtrRef: get(row, "CdtrRef"),
    Ustrd: get(row, "Ustrd"),
    payeeName: get(row, "payeeName"),
    payeeCountry: get(row, "payeeCountry"),
  }));
}

/** "1,234.50" -> "1234.50"; " 12.5 " -> "12.5"; "12,50" is left for the validator to reject rather than guessed. */
export function normalizeAmount(raw: string): string {
  const s = raw.trim();
  return /^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s) ? s.replace(/,/g, "") : s;
}

/** Coerces a JSON ledger's instructions into the shape the engine expects, with readable errors. */
export function normalizeInstructions(raw: unknown): PayoutInstruction[] {
  if (!Array.isArray(raw)) throw new Error("JSON ledger needs an instructions array");
  return raw.map((r, n) => {
    const row = (r ?? {}) as Record<string, unknown>;
    const id = typeof row.EndToEndId === "string" ? row.EndToEndId.trim() : "";
    if (!id) throw new Error(`Instruction ${n + 1} has no EndToEndId`);
    const amount = typeof row.amount === "number" ? String(row.amount) : typeof row.amount === "string" ? normalizeAmount(row.amount) : "";
    if (!amount) throw new Error(`Instruction ${id} has no amount`);
    const direction = String(row.direction ?? "out").toLowerCase() === "in" ? "in" : "out";
    const token = String(row.token ?? "USDC").toUpperCase() === "EURC" ? "EURC" : "USDC";
    return {
      EndToEndId: id,
      direction,
      recipient: String(row.recipient ?? "").trim() as `0x${string}`,
      payer: row.payer ? (String(row.payer).trim() as `0x${string}`) : undefined,
      amount,
      token,
      Purp: row.Purp ? String(row.Purp) : undefined,
      CdtrRef: row.CdtrRef ? String(row.CdtrRef) : undefined,
      Ustrd: row.Ustrd ? String(row.Ustrd) : undefined,
      payeeName: row.payeeName ? String(row.payeeName) : undefined,
      payeeCountry: row.payeeCountry ? String(row.payeeCountry) : undefined,
    };
  });
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
    return { ...parsed, instructions: normalizeInstructions(parsed.instructions) };
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
