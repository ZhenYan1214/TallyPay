import { keccak256, concat, stringToHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

/**
 * Demo recipients are derived from the payer key plus a label, so whoever
 * holds the payer key can later sweep the demo funds back.
 */
export function demoWallet(payerKey: Hex, label: string) {
  const key = keccak256(concat([payerKey, stringToHex(`tallypay-demo:${label}`)]));
  return { key, account: privateKeyToAccount(key) };
}
