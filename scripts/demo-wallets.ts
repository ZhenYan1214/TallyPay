import { keccak256, concat, stringToHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

/**
 * Demo recipients are derived from the payer key plus a label, so whoever
 * holds the payer key can later sweep the demo funds back.
 *
 * The derivation label keeps its original "tallypay-demo" spelling on purpose:
 * changing it would change every demo address and strand funds already sent.
 */
export function demoWallet(payerKey: Hex, label: string) {
  const key = keccak256(concat([payerKey, stringToHex(`tallypay-demo:${label}`)]));
  return { key, account: privateKeyToAccount(key) };
}
