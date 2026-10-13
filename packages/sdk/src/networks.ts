import { defineChain, type Address } from "viem";

/**
 * Arc network definitions. Addresses come from
 * https://docs.arc.io/arc/references/contract-addresses
 *
 * USDC is Arc's native gas token. The native balance uses 18 decimals,
 * while the ERC-20 interface at 0x3600… uses 6 decimals. Tallypay always
 * moves USDC through the ERC-20 interface and records amounts in 6 decimals.
 */
export type NetworkId = "arc-mainnet" | "arc-testnet";

export interface ArcNetwork {
  id: NetworkId;
  chainId: number;
  name: string;
  rpcUrl: string;
  explorerUrl: string;
  contracts: {
    usdc: Address;
    eurc: Address;
    memo: Address;
    multicall3From: Address;
  };
}

export const ARC_MAINNET: ArcNetwork = {
  id: "arc-mainnet",
  chainId: 5042,
  name: "Arc Mainnet",
  rpcUrl: "https://rpc.mainnet.arc.io",
  explorerUrl: "https://explorer.arc.io",
  contracts: {
    usdc: "0x3600000000000000000000000000000000000000",
    eurc: "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1",
    memo: "0x5294E9927c3306DcBaDb03fe70b92e01cCede505",
    multicall3From: "0x522fAf9A91c41c443c66765030741e4AaCe147D0",
  },
};

export const ARC_TESTNET: ArcNetwork = {
  id: "arc-testnet",
  chainId: 5042002,
  name: "Arc Testnet",
  rpcUrl: "https://rpc.testnet.arc.io",
  explorerUrl: "https://explorer.testnet.arc.io",
  contracts: {
    usdc: "0x3600000000000000000000000000000000000000",
    eurc: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a",
    memo: "0x5294E9927c3306DcBaDb03fe70b92e01cCede505",
    multicall3From: "0x522fAf9A91c41c443c66765030741e4AaCe147D0",
  },
};

export const NETWORKS: Record<NetworkId, ArcNetwork> = {
  "arc-mainnet": ARC_MAINNET,
  "arc-testnet": ARC_TESTNET,
};

/** USDC and EURC both use 6 decimals through their ERC-20 interfaces. */
export const TOKEN_DECIMALS = 6;

/** Arc drops transactions whose maxFeePerGas is below 20 gwei, without an error. */
export const MIN_MAX_FEE_PER_GAS = 20_000_000_000n;

/** Public RPCs reject eth_getLogs ranges above roughly 10,000 blocks. */
export const MAX_LOG_RANGE = 9_000n;

export function toViemChain(network: ArcNetwork, rpcUrl = network.rpcUrl) {
  return defineChain({
    id: network.chainId,
    name: network.name,
    nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
    blockExplorers: { default: { name: "Arcscan", url: network.explorerUrl } },
  });
}

export function txUrl(network: ArcNetwork, hash: string): string {
  return `${network.explorerUrl}/tx/${hash}`;
}

export function addressUrl(network: ArcNetwork, address: string): string {
  return `${network.explorerUrl}/address/${address}`;
}
