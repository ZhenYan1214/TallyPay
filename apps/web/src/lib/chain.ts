import { createPublicClient, http, type PublicClient } from "viem";
import { NETWORKS, toViemChain, type NetworkId } from "@tieout/sdk";

const cache = new Map<string, PublicClient>();

const rpcKey = (id: NetworkId) => "tieout:rpc:" + id;

/** A user-chosen RPC for a network, kept in this browser only. Empty means the public default. */
export function rpcOverride(id: NetworkId): string {
  try {
    return localStorage.getItem(rpcKey(id)) ?? "";
  } catch {
    return "";
  }
}

export function setRpcOverride(id: NetworkId, url: string) {
  try {
    if (url.trim()) localStorage.setItem(rpcKey(id), url.trim());
    else localStorage.removeItem(rpcKey(id));
  } catch {
    // Private windows may refuse storage; the override then lasts for this page only.
  }
}

/**
 * JSON-RPC batching turns the reader's bursts of getBlock/getTransactionReceipt
 * calls into a handful of HTTP requests, which is what public RPCs rate-limit on.
 */
export function publicClientFor(id: NetworkId): PublicClient {
  const url = rpcOverride(id) || NETWORKS[id].rpcUrl;
  const key = id + ":" + url;
  let client = cache.get(key);
  if (!client) {
    client = createPublicClient({ chain: toViemChain(NETWORKS[id], url), transport: http(url, { batch: { wait: 20 } }) }) as PublicClient;
    cache.set(key, client);
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
