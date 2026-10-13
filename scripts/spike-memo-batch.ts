/**
 * Spike: does Arc's Memo contract still attribute the payer correctly when it
 * is called through Multicall3From? Sends a tiny batch on testnet and prints
 * every log so we can see which addresses emit Transfer and Memo events.
 *
 *   npm run spike
 */
import { decodeEventLog, keccak256, stringToHex, type Address } from "viem";
import { buildPayoutRun, erc20Abi, memoAbi, fromUnits, decodeMemo, MIN_MAX_FEE_PER_GAS } from "@tieout/sdk";
import { clients, resolveNetwork } from "./env.js";

const network = resolveNetwork();
if (network.id !== "arc-testnet") throw new Error("The spike only runs on testnet");
const { publicClient, walletClient, account } = clients(network);

// Throwaway recipients derived from fixed labels. Testnet funds sent here are not recoverable.
const recipient = (label: string) => `0x${keccak256(stringToHex(label)).slice(26)}` as Address;

const balance = await publicClient.readContract({
  address: network.contracts.usdc,
  abi: erc20Abi,
  functionName: "balanceOf",
  args: [account!.address],
});
console.log(`Payer ${account!.address} holds ${fromUnits(balance)} USDC`);
if (balance < 50_000n) throw new Error("Need at least 0.05 testnet USDC. Use https://faucet.circle.com");

const runId = `SPIKE-${Date.now()}`;
const plan = buildPayoutRun({
  network,
  payer: account!.address,
  PmtInfId: runId,
  instructions: [
    { EndToEndId: `${runId}-1`, recipient: recipient("tieout-spike-a"), amount: "0.01", token: "USDC", Purp: "COMM" },
    { EndToEndId: `${runId}-2`, recipient: recipient("tieout-spike-b"), amount: "0.02", token: "USDC", Purp: "COMM", CdtrRef: "INV-42" },
  ],
});

await publicClient.call({ account: account!.address, to: plan.to, data: plan.data });
console.log("Simulation OK. Sending…");

const hash = await walletClient!.sendTransaction({
  to: plan.to,
  data: plan.data,
  maxFeePerGas: MIN_MAX_FEE_PER_GAS * 3n,
  maxPriorityFeePerGas: 1_000_000_000n,
});
const receipt = await publicClient.waitForTransactionReceipt({ hash });
console.log(`\nTx ${hash}\nstatus=${receipt.status} block=${receipt.blockNumber} gasUsed=${receipt.gasUsed} effectiveGasPrice=${receipt.effectiveGasPrice}`);
console.log(`Fee: ${Number(receipt.gasUsed * receipt.effectiveGasPrice) / 1e18} USDC\n`);

for (const log of receipt.logs) {
  let decoded = "";
  for (const abi of [memoAbi, erc20Abi]) {
    try {
      const ev = decodeEventLog({ abi, data: log.data, topics: log.topics });
      decoded = `${ev.eventName} ${JSON.stringify(ev.args, (_k, v) => (typeof v === "bigint" ? v.toString() : v))}`;
      if (ev.eventName === "Memo") decoded += `\n      decoded memo: ${JSON.stringify(decodeMemo((ev.args as { memo: `0x${string}` }).memo))}`;
      break;
    } catch {
      // not this ABI
    }
  }
  console.log(`#${log.logIndex} ${log.address}\n   ${decoded || log.topics.join(" ")}`);
}
console.log(`\n${network.explorerUrl}/tx/${hash}`);
