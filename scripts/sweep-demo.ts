/**
 * Sends demo funds back to the payer. Demo recipients are derived from the
 * payer key (see demo-wallets.ts), so the payer can always recover them.
 * USDC is Arc's gas token, so each wallet pays its own fee out of the balance.
 *
 *   npm run sweep -- --network=arc-testnet
 *   npm run sweep -- --network=arc-testnet --testwallet   # also sweep .env.testwallet
 */
import { existsSync, readFileSync } from "node:fs";
import { createWalletClient, formatUnits, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { toViemChain, MIN_MAX_FEE_PER_GAS } from "@tallypay/sdk";
import { clients, resolveNetwork, rpcFor } from "./env.js";
import { demoWallet } from "./demo-wallets.js";

const network = resolveNetwork();
const { publicClient, account } = clients(network);
const payer = account!.address;
const payerKey = (process.env[network.id === "arc-mainnet" ? "MAINNET_PRIVATE_KEY" : "TESTNET_PRIVATE_KEY"]!.trim().replace(/^(?!0x)/, "0x")) as Hex;

const keys: Array<{ label: string; key: Hex }> = [
  ...Array.from({ length: 12 }, (_, i) => `seller-${String(i + 1).padStart(2, "0")}`),
  "unknown-counterparty",
].map((label) => ({ label, key: demoWallet(payerKey, label).key }));

if (process.argv.includes("--testwallet") && existsSync(".env.testwallet")) {
  const key = readFileSync(".env.testwallet", "utf8").match(/TEST_WALLET_KEY=(0x[0-9a-fA-F]{64})/)?.[1] as Hex | undefined;
  if (key) keys.push({ label: "dev test wallet", key });
}

const chain = toViemChain(network, rpcFor(network));
const maxFeePerGas = MIN_MAX_FEE_PER_GAS * 2n;
let recovered = 0n;

for (const { label, key } of keys) {
  const from = privateKeyToAccount(key);
  const balance = await publicClient.getBalance({ address: from.address });
  if (balance === 0n) {
    console.log(`${label.padEnd(22)} ${from.address} · empty`);
    continue;
  }
  const gas = await publicClient.estimateGas({ account: from.address, to: payer, value: 1n });
  const fee = gas * maxFeePerGas;
  if (balance <= fee * 2n) {
    console.log(`${label.padEnd(22)} ${from.address} · ${formatUnits(balance, 18)} USDC · nothing to sweep`);
    continue;
  }
  const value = balance - fee;
  const wallet = createWalletClient({ chain, account: from, transport: http() });
  const hash = await wallet.sendTransaction({ to: payer, value, gas, maxFeePerGas, maxPriorityFeePerGas: 1_000_000_000n });
  await publicClient.waitForTransactionReceipt({ hash });
  recovered += value;
  console.log(`${label.padEnd(22)} ${from.address} · swept ${formatUnits(value, 18).slice(0, 10)} USDC`);
}
console.log(`\nRecovered ${formatUnits(recovered, 18)} USDC to ${payer} on ${network.name}`);
