import { describe, expect, it } from "vitest";
import { detectDelimiter, instructionsFromCsv, normalizeAmount, normalizeInstructions, parseCsv } from "../src/lib/ledger-io";

describe("ledger CSV parsing", () => {
  it("strips a UTF-8 BOM and reads comma files", () => {
    const rows = instructionsFromCsv("﻿EndToEndId,recipient,amount\nA-1,0x0000000000000000000000000000000000000001,1.50\n");
    expect(rows[0]).toMatchObject({ EndToEndId: "A-1", amount: "1.50", token: "USDC", direction: "out" });
  });

  it("detects semicolon and tab delimiters from the header", () => {
    expect(detectDelimiter("a;b;c\n1;2;3")).toBe(";");
    expect(detectDelimiter("a\tb\n1\t2")).toBe("\t");
    expect(detectDelimiter("a,b\n")).toBe(",");
    const rows = instructionsFromCsv("EndToEndId;recipient;amount;direction;payer\nI-1;0x0000000000000000000000000000000000000002;25;in;0x0000000000000000000000000000000000000003\n");
    expect(rows[0]).toMatchObject({ EndToEndId: "I-1", direction: "in", amount: "25", payer: "0x0000000000000000000000000000000000000003" });
  });

  it("handles quoted fields with delimiters and escaped quotes", () => {
    expect(parseCsv('a,b\n"x, y","say ""hi"""\n')).toEqual([["a", "b"], ["x, y", 'say "hi"']]);
  });

  it("removes thousands separators but does not guess decimal commas", () => {
    expect(normalizeAmount("1,234.50")).toBe("1234.50");
    expect(normalizeAmount(" 12.5 ")).toBe("12.5");
    expect(normalizeAmount("12,50")).toBe("12,50");
  });

  it("explains what is wrong with a JSON ledger", () => {
    expect(() => normalizeInstructions({})).toThrow(/instructions array/);
    expect(() => normalizeInstructions([{ amount: "1" }])).toThrow(/Instruction 1 has no EndToEndId/);
    expect(() => normalizeInstructions([{ EndToEndId: "X" }])).toThrow(/X has no amount/);
    const [row] = normalizeInstructions([{ EndToEndId: " X ", amount: 2.5, token: "eurc", direction: "IN", recipient: "0xabc" }]);
    expect(row).toMatchObject({ EndToEndId: "X", amount: "2.5", token: "EURC", direction: "in", recipient: "0xabc" });
  });
});
