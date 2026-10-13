/**
 * Development-only EIP-1193 wallet for exercising the Pay flow without a
 * browser extension. Loaded only by `npm run dev` with `?testwallet` in the
 * URL, and only for Arc Testnet. The production build never includes it.
 *
 * Put a throwaway testnet key in sessionStorage under "tallypay:testkey".
 */
import { createPublicClient, createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ARC_TESTNET, toViemChain } from "@tallypay/sdk";

const key = sessionStorage.getItem("tallypay:testkey") as Hex | null;
if (key) {
  const chain = toViemChain(ARC_TESTNET);
  const account = privateKeyToAccount(key);
  const wallet = createWalletClient({ chain, account, transport: http() });
  const reader = createPublicClient({ chain, transport: http() });
  const chainIdHex = `0x${ARC_TESTNET.chainId.toString(16)}`;

  (window as unknown as { ethereum: unknown }).ethereum = {
    isTallypayTestWallet: true,
    async request({ method, params }: { method: string; params?: unknown[] }) {
      switch (method) {
        case "eth_requestAccounts":
        case "eth_accounts":
          return [account.address];
        case "eth_chainId":
          return chainIdHex;
        case "wallet_switchEthereumChain": {
          const wanted = (params?.[0] as { chainId: string }).chainId;
          if (wanted.toLowerCase() !== chainIdHex) throw Object.assign(new Error("Test wallet only supports Arc Testnet"), { code: 4902 });
          return null;
        }
        case "wallet_addEthereumChain":
          throw new Error("Test wallet only supports Arc Testnet");
        case "eth_sendTransaction": {
          const tx = params?.[0] as { to: Hex; data?: Hex; maxFeePerGas?: Hex; maxPriorityFeePerGas?: Hex };
          return wallet.sendTransaction({
            to: tx.to,
            data: tx.data,
            maxFeePerGas: tx.maxFeePerGas ? BigInt(tx.maxFeePerGas) : undefined,
            maxPriorityFeePerGas: tx.maxPriorityFeePerGas ? BigInt(tx.maxPriorityFeePerGas) : undefined,
          });
        }
        default:
          return reader.request({ method, params } as never);
      }
    },
  };
  console.info(`[tallypay] test wallet ${account.address} on Arc Testnet`);
}
