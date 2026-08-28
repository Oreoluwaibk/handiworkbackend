import Wallet from "../schema/walletSchema";
import Transaction from "../schema/transactionSchema";
import { saveNotifcation } from "./saveNotification";

export type TransactionType = "deposit" | "withdraw" | "debit" | "reverse";

export function validateTransactionAmount(amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Amount must be a positive number");
  }
}

async function applyWalletDelta(userId: string, delta: number) {
  if (delta < 0) {
    const wallet = await Wallet.findOneAndUpdate(
      { user_id: userId, is_active: true, balance: { $gte: Math.abs(delta) } },
      { $inc: { balance: delta } },
      { new: true }
    );
    if (!wallet) {
      throw new Error("Insufficient balance or wallet unavailable");
    }
    return wallet;
  }

  const wallet = await Wallet.findOneAndUpdate(
    { user_id: userId, is_active: true },
    { $inc: { balance: delta } },
    { new: true }
  );
  if (!wallet) {
    throw new Error("Wallet not available");
  }
  return wallet;
}

async function rollbackWalletDelta(userId: string, delta: number) {
  await Wallet.findOneAndUpdate({ user_id: userId }, { $inc: { balance: -delta } });
}

export async function processTransaction({
  user_id,
  type,
  amount,
  description,
  status = "completed",
  reference,
}: {
  user_id: string | any;
  type: TransactionType;
  amount: number;
  description?: string;
  status?: string;
  reference?: string;
}) {
  validateTransactionAmount(amount);

  if (reference) {
    const existing = await Transaction.findOne({ reference });
    if (existing) return existing;
  }

  const isDebit = type === "withdraw" || type === "debit";
  const isCredit = type === "deposit" || type === "reverse";
  const delta = isCredit ? amount : -amount;

  await applyWalletDelta(user_id.toString(), delta);

  try {
    const transaction = await Transaction.create({
      user_id,
      type,
      amount,
      description:
        description ||
        (type === "deposit"
          ? "Wallet deposit"
          : type === "reverse"
          ? "Wallet reversal"
          : "Wallet withdrawal"),
      status,
      reference,
    });

    if (status === "completed") {
      await saveNotifcation(
        `Transaction - ${type}`,
        `${amount} has been ${isCredit ? "credited to" : "withdrawn from"} your wallet`,
        user_id,
        "transaction",
        transaction._id.toString()
      );
    }

    return transaction;
  } catch (error: any) {
    await rollbackWalletDelta(user_id.toString(), delta);

    if (error?.code === 11000 && reference) {
      const existing = await Transaction.findOne({ reference });
      if (existing) return existing;
    }

    throw error;
  }
}
