import { encodeFunctionData, type Address, type Hex } from "viem";
import { erc20Abi, memoAbi, multicall3FromAbi } from "./abis.js";
import {
  encodePaymentMemo,
  encodeReferenceMemo,
  encodeRunAnchor,
  paymentMemoId,
  runAnchorMemoId,
  type ReferenceMemo,
  type RunAnchor,
} from "./memo.js";
import { controlSum, ledgerHash, normalizeInstruction, toUnits, type PayoutInstruction } from "./ledger.js";
import type { ArcNetwork } from "./networks.js";

export interface Call3 {
  target: Address;
  allowFailure: boolean;
  callData: Hex;
}

export interface PayoutRunPlan {
  /** Send this transaction from the payer EOA. */
  to: Address;
  data: Hex;
  calls: Call3[];
  anchor: RunAnchor;
  instructions: PayoutInstruction[];
}

export interface BuildPayoutRunOptions {
  network: ArcNetwork;
  payer: Address;
  PmtInfId: string;
  instructions: PayoutInstruction[];
  /** Write a RunAnchor memo before the payments. Defaults to true. */
  anchor?: boolean;
  /** All-or-nothing batch. Defaults to true. */
  atomic?: boolean;
}

export const MAX_BATCH_SIZE = 100;

function tokenAddress(network: ArcNetwork, token: PayoutInstruction["token"]): Address {
  return token === "EURC" ? network.contracts.eurc : network.contracts.usdc;
}

export function transferCallData(recipient: Address, units: bigint): Hex {
  return encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [recipient, units] });
}

/**
 * Builds a single transaction that pays every instruction through Arc's
 * Memo contract, batched with Multicall3From. Multicall3From and Memo both
 * route through Arc's CallFrom precompile, so the payer EOA stays the
 * msg.sender of each USDC transfer and the `sender` of each Memo event.
 */
export function buildPayoutRun(options: BuildPayoutRunOptions): PayoutRunPlan {
  const { network, payer, PmtInfId } = options;
  const atomic = options.atomic ?? true;
  const instructions = options.instructions.map(normalizeInstruction);

  if (instructions.length === 0) throw new Error("A payout run needs at least one instruction");
  if (instructions.some((i) => i.direction === "in")) throw new Error("A payout run only sends money out; receivables are reconciled, not paid");
  if (instructions.length > MAX_BATCH_SIZE) {
    throw new Error(`A payout run is limited to ${MAX_BATCH_SIZE} payments; split it into several runs`);
  }
  const tokens = new Set(instructions.map((i) => i.token));
  if (tokens.size > 1) throw new Error("A payout run must use a single token so CtrlSum stays meaningful");
  const ids = new Set<string>();
  for (const i of instructions) {
    if (ids.has(i.EndToEndId)) throw new Error(`Duplicate EndToEndId ${i.EndToEndId}`);
    ids.add(i.EndToEndId);
  }

  const token = tokenAddress(network, instructions[0]!.token);
  const anchor: RunAnchor = {
    PmtInfId,
    NbOfTxs: instructions.length,
    CtrlSum: controlSum(instructions),
    LedgerHash: ledgerHash(instructions),
  };

  const calls: Call3[] = [];
  if (options.anchor ?? true) {
    // A zero-value self-transfer gives the anchor memo a harmless call to wrap.
    calls.push({
      target: network.contracts.memo,
      allowFailure: false,
      callData: encodeFunctionData({
        abi: memoAbi,
        functionName: "memo",
        args: [token, transferCallData(payer, 0n), runAnchorMemoId(PmtInfId), encodeRunAnchor(anchor)],
      }),
    });
  }

  for (const instruction of instructions) {
    const memoData = encodePaymentMemo({
      EndToEndId: instruction.EndToEndId,
      PmtInfId,
      Purp: instruction.Purp,
      CdtrRef: instruction.CdtrRef,
      Ustrd: instruction.Ustrd,
    });
    calls.push({
      target: network.contracts.memo,
      allowFailure: !atomic,
      callData: encodeFunctionData({
        abi: memoAbi,
        functionName: "memo",
        args: [
          token,
          transferCallData(instruction.recipient, toUnits(instruction.amount)),
          paymentMemoId(instruction.EndToEndId),
          memoData,
        ],
      }),
    });
  }

  const data = encodeFunctionData({ abi: multicall3FromAbi, functionName: "aggregate3", args: [calls] });
  return { to: network.contracts.multicall3From, data, calls, anchor, instructions };
}

/** A single payment through Memo, without batching. */
export function buildSinglePayment(network: ArcNetwork, instruction: PayoutInstruction, PmtInfId?: string) {
  const normalized = normalizeInstruction(instruction);
  const data = encodeFunctionData({
    abi: memoAbi,
    functionName: "memo",
    args: [
      tokenAddress(network, normalized.token),
      transferCallData(normalized.recipient, toUnits(normalized.amount)),
      paymentMemoId(normalized.EndToEndId),
      encodePaymentMemo({
        EndToEndId: normalized.EndToEndId,
        PmtInfId,
        Purp: normalized.Purp,
        CdtrRef: normalized.CdtrRef,
        Ustrd: normalized.Ustrd,
      }),
    ],
  });
  return { to: network.contracts.memo, data };
}

export interface ReferenceBatchPlan {
  to: Address;
  data: Hex;
  calls: Call3[];
  references: ReferenceMemo[];
}

/**
 * Publishes references for transfers that could not carry memos themselves
 * (Safe, MPC, exchange withdrawals, plain wallet sends). Any EOA can sign
 * it: the memo's `sender` is the attesting wallet, the transfer's `from`
 * stays whoever paid. Each reference wraps a zero-value self-transfer, the
 * same harmless call the run anchor uses, and shares the payment's memoId
 * so lookups by EndToEndId find it.
 */
export function buildReferenceBatch(options: { network: ArcNetwork; signer: Address; references: ReferenceMemo[] }): ReferenceBatchPlan {
  const { network, signer } = options;
  if (options.references.length === 0) throw new Error("No references to publish");
  if (options.references.length > MAX_BATCH_SIZE) throw new Error(`At most ${MAX_BATCH_SIZE} references per transaction`);
  const seen = new Set<string>();
  const calls: Call3[] = [];
  for (const ref of options.references) {
    if (seen.has(ref.EndToEndId)) throw new Error(`Duplicate EndToEndId ${ref.EndToEndId}`);
    seen.add(ref.EndToEndId);
    calls.push({
      target: network.contracts.memo,
      allowFailure: false,
      callData: encodeFunctionData({
        abi: memoAbi,
        functionName: "memo",
        args: [network.contracts.usdc, transferCallData(signer, 0n), paymentMemoId(ref.EndToEndId), encodeReferenceMemo(ref)],
      }),
    });
  }
  const data = encodeFunctionData({ abi: multicall3FromAbi, functionName: "aggregate3", args: [calls] });
  return { to: network.contracts.multicall3From, data, calls, references: options.references };
}
