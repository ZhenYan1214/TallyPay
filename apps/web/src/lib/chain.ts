import { createPublicClient, http, type PublicClient } from "viem";
import { NETWORKS, toViemChain, type NetworkId } from "@tieout/sdk";

const cache = new Map<NetworkId, PublicClient>();

export function publicClientFor(id: NetworkId): PublicClient {
  let client = cache.get(id);
  if (!client) {
    client = createPublicClient({ chain: toViemChain(NETWORKS[id]), transport: http() }) as PublicClient;
    cache.set(id, client);
  }
  return client;
}

interface Eip1193 {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

export function injectedProvider(): Eip1193 | undefined {
  return (window as unknown as { ethereum?: Eip1193 }).ethereum;
}

/** Asks the wallet to switch to an Arc network, adding it first if needed. */
export async function ensureNetwork(provider: Eip1193, id: NetworkId) {
  const network = NETWORKS[id];
  const chainIdHex = `0x${network.chainId.toString(16)}`;
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chainIdHex }] });
  } catch (error) {
    if ((error as { code?: number }).code !== 4902) throw error;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: chainIdHex,
          chainName: network.name,
          nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
          rpcUrls: [network.rpcUrl],
          blockExplorerUrls: [network.explorerUrl],
        },
      ],
    });
  }
}
