import { getAddress, isAddress, keccak256, parseUnits, formatUnits, stringToHex, type Address, type Hex } from "viem";
import { TOKEN_DECIMALS } from "./networks.js";

export type TokenSymbol = "USDC" | "EURC";

/**
 * One intended payment, as recorded in the payer's own system before it is
 * sent. Payee names and other personal data live here, off-chain, and are
 * never written into memos.
 */
export interface PayoutInstruction {
  EndToEndId: string;
  recipient: Address;
  /** Decimal string in token units, e.g. "12.50". */
  amount: string;
  token: TokenSymbol;
  Purp?: string;
  CdtrRef?: string;
  Ustrd?: string;
  /** Off-chain only. */
  payeeName?: string;
  /** Off-chain only, e.g. ISO 3166 country code. */
  payeeCountry?: string;
}

export interface PayoutRunLedger {
  PmtInfId: string;
  network: "arc-mainnet" | "arc-testnet";
  payer: Address;
  createdAt: string;
  description?: string;
  instructions: PayoutInstruction[];
  /** Filled in after the run is broadcast. */
  execution?: {
    txHash: Hex;
    blockNumber: string;
  };
}

export function toUnits(amount: string): bigint {
  return parseUnits(amount, TOKEN_DECIMALS);
}

export function fromUnits(units: bigint): string {
  return formatUnits(units, TOKEN_DECIMALS);
}

export function normalizeInstruction(input: PayoutInstruction): PayoutInstruction {
  if (!isAddress(input.recipient)) throw new Error(`Invalid recipient for ${input.EndToEndId}: ${input.recipient}`);
  const units = toUnits(input.amount);
  if (units <= 0n) throw new Error(`Amount must be positive for ${input.EndToEndId}`);
  return { ...input, recipient: getAddress(input.recipient), amount: fromUnits(units) };
}

/**
 * Deterministic commitment to a list of payments. Sorting by EndToEndId makes
 * the hash independent of row order; amounts are hashed in base units so
 * "1.5" and "1.50" produce the same result.
 */
export function ledgerHash(instructions: PayoutInstruction[]): Hex {
  const lines = instructions
    .map((i) => `${i.EndToEndId}|${i.recipient.toLowerCase()}|${toUnits(i.amount).toString()}|${i.token}`)
    .sort();
  return keccak256(stringToHex(lines.join("\n")));
}

export function controlSum(instructions: PayoutInstruction[]): string {
  return fromUnits(instructions.reduce((sum, i) => sum + toUnits(i.amount), 0n));
}
