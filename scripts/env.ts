import "dotenv/config";
import { createPublicClient, createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { NETWORKS, toViemChain, type ArcNetwork, type NetworkId } from "@tieout/sdk";

export function resolveNetwork(argv = process.argv): ArcNetwork {
  const flag = argv.find((a) => a.startsWith("--network="))?.split("=")[1] ?? "arc-testnet";
  if (!(flag in NETWORKS)) throw new Error(`Unknown network ${flag}. Use arc-testnet or arc-mainnet.`);
  return NETWORKS[flag as NetworkId];
}

export function rpcFor(network: ArcNetwork): string {
  const override = network.id === "arc-mainnet" ? process.env.ARC_MAINNET_RPC : process.env.ARC_TESTNET_RPC;
  return override || network.rpcUrl;
}

export function clients(network: ArcNetwork, { needsSigner = true } = {}) {
  const chain = toViemChain(network, rpcFor(network));
  const publicClient = createPublicClient({ chain, transport: http() });
  if (!needsSigner) return { chain, publicClient, walletClient: undefined, account: undefined };

  const keyName = network.id === "arc-mainnet" ? "MAINNET_PRIVATE_KEY" : "TESTNET_PRIVATE_KEY";
  const raw = process.env[keyName]?.trim();
  if (!raw) throw new Error(`${keyName} is not set. Copy .env.example to .env and fill it in.`);
  const key = (raw.startsWith("0x") ? raw : `0x${raw}`) as Hex;
  const account = privateKeyToAccount(key);
  const walletClient = createWalletClient({ chain, transport: http(), account });
  return { chain, publicClient, walletClient, account };
}
