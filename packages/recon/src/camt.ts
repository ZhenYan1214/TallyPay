import { fromUnits } from "@tieout/sdk";
import type { ReconReport } from "./reconcile.js";

/**
 * ISO 20022 camt.054 (Bank-to-Customer Debit/Credit Notification) for an
 * Arc wallet.
 *
 * Circle Mint already delivers camt.053 statements for Mint accounts, so
 * treasury systems that ingest those can ingest this: one notification per
 * reconciliation run, one entry per on-chain transfer, with the memo's
 * EndToEndId and creditor reference where the chain carried them, and the
 * transaction hash as the account servicer reference.
 *
 * Currency mapping is a choice, not a standard: USDC is reported as USD and
 * EURC as EUR, with the token and network named in the proprietary bank
 * transaction code. Validate against your own TMS before relying on it.
 */
export interface CamtOptions {
  /** Message id. Defaults to a timestamp-based id. */
  msgId?: string;
  /** Account owner name for <Ownr>. */
  ownerName?: string;
  /** Network label used in the proprietary code, e.g. "ARC". */
  network?: string;
}

const NS = "urn:iso:std:iso:20022:tech:xsd:camt.054.001.08";

function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function ccy(token: string): string {
  return token === "EURC" ? "EUR" : "USD";
}

function dateTime(ts: number): string {
  return new Date(ts * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
}

function date(ts: number): string {
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

/** Decimal with at most 5 fraction digits, as ISO 20022 ActiveCurrencyAndAmount allows. */
function amt(units: bigint): string {
  const s = fromUnits(units);
  const [whole, frac = ""] = s.split(".");
  const f = frac.slice(0, 5).replace(/0+$/, "");
  return f ? `${whole}.${f}` : whole!;
}

export function camt054Xml(report: ReconReport, options: CamtOptions = {}): string {
  const network = options.network ?? "ARC";
  const created = report.generatedAt.replace(/\.\d{3}Z$/, "Z");
  const msgId = options.msgId ?? `TIEOUT-${report.generatedAt.replace(/[-:.TZ]/g, "").slice(0, 14)}`;
  const items = report.items.filter((i) => i.transfer);

  const entries = items
    .map((item) => {
      const t = item.transfer!;
      const credit = item.direction === "in";
      const memo = t.memo?.decoded.kind === "payment" ? t.memo.decoded.memo : undefined;
      const e2e = item.instruction?.EndToEndId ?? memo?.EndToEndId;
      const counterparty = credit ? t.from : t.to;
      const refs = [
        e2e ? `<EndToEndId>${esc(e2e)}</EndToEndId>` : "<EndToEndId>NOTPROVIDED</EndToEndId>",
        `<TxId>${esc(t.txHash)}</TxId>`,
        memo?.PmtInfId || item.instruction?.PmtInfId ? `<PmtInfId>${esc(memo?.PmtInfId ?? item.instruction!.PmtInfId)}</PmtInfId>` : "",
      ].join("");
      const purpose = memo?.Purp ?? item.instruction?.Purp;
      const cdtrRef = memo?.CdtrRef ?? item.instruction?.CdtrRef;
      const ustrd = memo?.Ustrd ?? item.instruction?.Ustrd;
      const rmt = cdtrRef
        ? `<RmtInf><Strd><CdtrRefInf><Ref>${esc(cdtrRef)}</Ref></CdtrRefInf></Strd></RmtInf>`
        : ustrd
          ? `<RmtInf><Ustrd>${esc(ustrd.slice(0, 140))}</Ustrd></RmtInf>`
          : "";
      const party = credit
        ? `<RltdPties><Dbtr><Pty><Id><OrgId><Othr><Id>${esc(counterparty)}</Id><SchmeNm><Prtry>${network}-ADDRESS</Prtry></SchmeNm></Othr></OrgId></Id></Pty></Dbtr></RltdPties>`
        : `<RltdPties><Cdtr><Pty>${item.instruction?.payeeName ? `<Nm>${esc(item.instruction.payeeName)}</Nm>` : ""}<Id><OrgId><Othr><Id>${esc(counterparty)}</Id><SchmeNm><Prtry>${network}-ADDRESS</Prtry></SchmeNm></Othr></OrgId></Id></Pty></Cdtr></RltdPties>`;
      const info = [`tieout:${item.status}`, ...item.notes].join(" | ").slice(0, 500);
      return (
        `<Ntry>` +
        `<NtryRef>${esc(t.txHash)}:${t.logIndex}</NtryRef>` +
        `<Amt Ccy="${ccy(t.token)}">${amt(t.amount)}</Amt>` +
        `<CdtDbtInd>${credit ? "CRDT" : "DBIT"}</CdtDbtInd>` +
        `<Sts><Cd>BOOK</Cd></Sts>` +
        `<BookgDt><DtTm>${dateTime(t.timestamp)}</DtTm></BookgDt>` +
        `<ValDt><Dt>${date(t.timestamp)}</Dt></ValDt>` +
        `<AcctSvcrRef>${esc(t.txHash)}</AcctSvcrRef>` +
        `<BkTxCd><Prtry><Cd>${t.token}-${network}${t.native ? "-NATIVE" : ""}</Cd><Issr>TIEOUT</Issr></Prtry></BkTxCd>` +
        `<NtryDtls><TxDtls>` +
        `<Refs>${refs}</Refs>` +
        `<Amt Ccy="${ccy(t.token)}">${amt(t.amount)}</Amt>` +
        `<CdtDbtInd>${credit ? "CRDT" : "DBIT"}</CdtDbtInd>` +
        party +
        (purpose ? `<Purp><Cd>${esc(purpose)}</Cd></Purp>` : "") +
        rmt +
        `<AddtlTxInf>${esc(info)}</AddtlTxInf>` +
        `</TxDtls></NtryDtls>` +
        `</Ntry>`
      );
    })
    .join("");

  const totalCredit = items.filter((i) => i.direction === "in").reduce((s, i) => s + i.transfer!.amount, 0n);
  const totalDebit = items.filter((i) => i.direction === "out").reduce((s, i) => s + i.transfer!.amount, 0n);
  const credits = items.filter((i) => i.direction === "in").length;
  const debits = items.length - credits;

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<Document xmlns="${NS}">` +
    `<BkToCstmrDbtCdtNtfctn>` +
    `<GrpHdr><MsgId>${esc(msgId)}</MsgId><CreDtTm>${created}</CreDtTm></GrpHdr>` +
    `<Ntfctn>` +
    `<Id>${esc(msgId)}-1</Id>` +
    `<CreDtTm>${created}</CreDtTm>` +
    `<Acct><Id><Othr><Id>${esc(report.account)}</Id><SchmeNm><Prtry>${network}-ADDRESS</Prtry></SchmeNm></Othr></Id>` +
    (options.ownerName ? `<Ownr><Nm>${esc(options.ownerName)}</Nm></Ownr>` : "") +
    `</Acct>` +
    `<TxsSummry>` +
    `<TtlCdtNtries><NbOfNtries>${credits}</NbOfNtries><Sum>${amt(totalCredit)}</Sum></TtlCdtNtries>` +
    `<TtlDbtNtries><NbOfNtries>${debits}</NbOfNtries><Sum>${amt(totalDebit)}</Sum></TtlDbtNtries>` +
    `</TxsSummry>` +
    entries +
    `</Ntfctn>` +
    `</BkToCstmrDbtCdtNtfctn>` +
    `</Document>\n`
  );
}
