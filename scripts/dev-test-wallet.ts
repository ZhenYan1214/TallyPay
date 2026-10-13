/**
 * Creates a throwaway Arc Testnet wallet for exercising the web app's Pay
 * flow (see apps/web/src/dev/test-wallet.ts) and funds it from
 * TESTNET_PRIVATE_KEY. The key is written to .env.testwallet, which is
 * git-ignored. Re-running reuses the existing key and tops it up.
 *
 *   npm run testwallet -- --amount=1
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { encodeFunctionData, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { ARC_TESTNET, erc20Abi, fromUnits, toUnits, MIN_MAX_FEE_PER_GAS } from "@tieout/sdk";
import { clients } from "./env.js";

const FILE = ".env.testwallet";
const amount = process.argv.find((a) => a.startsWith("--amount="))?.split("=")[1] ?? "1";

let key: Hex;
if (existsSync(FILE)) {
  key = readFileSync(FILE, "utf8").match(/TEST_WALLET_KEY=(0x[0-9a-fA-F]{64})/)![1] as Hex;
} else {
  key = generatePrivateKey();
  writeFileSync(FILE, `# Throwaway Arc Testnet wallet for the web app's dev test wallet. Never fund it on mainnet.\nTEST_WALLET_KEY=${key}\n`);
}
const testAccount = privateKeyToAccount(key);

const { publicClient, walletClient } = clients(ARC_TESTNET);
const hash = await walletClient!.sendTransaction({
  to: ARC_TESTNET.contracts.usdc,
  data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [testAccount.address, toUnits(amount)] }),
  maxFeePerGas: MIN_MAX_FEE_PER_GAS * 3n,
  maxPriorityFeePerGas: 1_000_000_000n,
});
await publicClient.waitForTransactionReceipt({ hash });
const balance = await publicClient.readContract({ address: ARC_TESTNET.contracts.usdc, abi: erc20Abi, functionName: "balanceOf", args: [testAccount.address] });
console.log(`Test wallet ${testAccount.address} funded with ${amount} USDC (balance ${fromUnits(balance)}). Key saved in ${FILE}.`);
