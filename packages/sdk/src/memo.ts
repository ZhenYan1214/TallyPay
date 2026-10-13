import { hexToString, keccak256, stringToHex, type Hex } from "viem";

/**
 * Tallypay memo format, version 1 ("tp1").
 *
 * Field names follow ISO 20022 credit transfer messages (pain.001 / pacs.008)
 * so that bank-side systems can map them without translation. This is a
 * proposal, not an official Arc standard.
 *
 * Memos are public and permanent. They must only carry identifiers, never
 * names, emails or other personal data. Identity mapping stays in the
 * payer's own records.
 */
export interface PaymentMemo {
  /** End-to-end identification, unique per payment. ISO 20022 Max35Text. */
  EndToEndId: string;
  /** Payment information id: the batch or payout run this payment belongs to. */
  PmtInfId?: string;
  /** ISO 20022 ExternalPurpose1Code, e.g. COMM, SUPP, SALA, GDDS. */
  Purp?: string;
  /** Creditor reference, e.g. an invoice number. */
  CdtrRef?: string;
  /** Unstructured remittance information. ISO 20022 Max140Text. */
  Ustrd?: string;
}

/**
 * Header anchored on-chain at the start of a payout run. NbOfTxs and CtrlSum
 * mirror the ISO 20022 group header; LedgerHash commits to the full list of
 * intended payments without revealing it.
 */
export interface RunAnchor {
  PmtInfId: string;
  NbOfTxs: number;
  /** Sum of all payment amounts, as a decimal string in token units. */
  CtrlSum: string;
  LedgerHash: Hex;
}

export const PAYMENT_PREFIX = "tp1:";
export const ANCHOR_PREFIX = "tp1-run:";

const MAX35 = /^[A-Za-z0-9/\-?:().,'+ ]{1,35}$/;
const PURPOSE = /^[A-Z]{4}$/;

export class MemoValidationError extends Error {}

export function validatePaymentMemo(memo: PaymentMemo): void {
  if (!MAX35.test(memo.EndToEndId)) {
    throw new MemoValidationError(`EndToEndId must be 1-35 ISO 20022 characters: "${memo.EndToEndId}"`);
  }
  if (memo.PmtInfId !== undefined && !MAX35.test(memo.PmtInfId)) {
    throw new MemoValidationError(`PmtInfId must be 1-35 ISO 20022 characters: "${memo.PmtInfId}"`);
  }
  if (memo.CdtrRef !== undefined && !MAX35.test(memo.CdtrRef)) {
    throw new MemoValidationError(`CdtrRef must be 1-35 ISO 20022 characters: "${memo.CdtrRef}"`);
  }
  if (memo.Purp !== undefined && !PURPOSE.test(memo.Purp)) {
    throw new MemoValidationError(`Purp must be a 4-letter ISO 20022 purpose code: "${memo.Purp}"`);
  }
  if (memo.Ustrd !== undefined && (memo.Ustrd.length === 0 || memo.Ustrd.length > 140)) {
    throw new MemoValidationError("Ustrd must be 1-140 characters");
  }
}

/** Fixed key order keeps encodings deterministic. */
function compact<T extends object>(obj: T, keys: (keyof T)[]): Partial<T> {
  const out: Partial<T> = {};
  for (const key of keys) {
    if (obj[key] !== undefined) out[key] = obj[key];
  }
  return out;
}

export function encodePaymentMemo(memo: PaymentMemo): Hex {
  validatePaymentMemo(memo);
  const body = compact(memo, ["EndToEndId", "PmtInfId", "Purp", "CdtrRef", "Ustrd"]);
  return stringToHex(PAYMENT_PREFIX + JSON.stringify(body));
}

export function encodeRunAnchor(anchor: RunAnchor): Hex {
  if (!MAX35.test(anchor.PmtInfId)) {
    throw new MemoValidationError(`PmtInfId must be 1-35 ISO 20022 characters: "${anchor.PmtInfId}"`);
  }
  const body = compact(anchor, ["PmtInfId", "NbOfTxs", "CtrlSum", "LedgerHash"]);
  return stringToHex(ANCHOR_PREFIX + JSON.stringify(body));
}

/** Indexed memoId for a payment. Lets anyone holding the ledger query its logs directly. */
export function paymentMemoId(endToEndId: string): Hex {
  return keccak256(stringToHex(PAYMENT_PREFIX + endToEndId));
}

export function runAnchorMemoId(pmtInfId: string): Hex {
  return keccak256(stringToHex(ANCHOR_PREFIX + pmtInfId));
}

export type DecodedMemo =
  | { kind: "payment"; memo: PaymentMemo }
  | { kind: "anchor"; anchor: RunAnchor }
  | { kind: "unknown"; text: string };

export function decodeMemo(data: Hex): DecodedMemo {
  let text: string;
  try {
    text = hexToString(data);
  } catch {
    return { kind: "unknown", text: data };
  }
  try {
    if (text.startsWith(ANCHOR_PREFIX)) {
      const anchor = JSON.parse(text.slice(ANCHOR_PREFIX.length)) as RunAnchor;
      if (typeof anchor.PmtInfId === "string" && typeof anchor.LedgerHash === "string") {
        return { kind: "anchor", anchor };
      }
    } else if (text.startsWith(PAYMENT_PREFIX)) {
      const memo = JSON.parse(text.slice(PAYMENT_PREFIX.length)) as PaymentMemo;
      if (typeof memo.EndToEndId === "string") return { kind: "payment", memo };
    }
  } catch {
    // Fall through: malformed JSON is reported as an unknown memo.
  }
  return { kind: "unknown", text };
}
