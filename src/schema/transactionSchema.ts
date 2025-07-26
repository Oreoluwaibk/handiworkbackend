// models/Transaction.ts
import { Schema, model, Types } from "mongoose";

export interface ITransaction {
  wallet_id: Types.ObjectId;
  user_id: Types.ObjectId;
  type: "deposit" | "withdraw" | "reverse";
  amount: number;
  status: "pending" | "completed" | "failed";
  reference?: string;
  description?: string;
  meta?: Record<string, any>;
}

const transactionSchema = new Schema<ITransaction>(
  {
    // wallet_id: { type: Schema.Types.ObjectId, ref: "Wallet", required: true },
    type: { type: String, enum: ["deposit", "withdraw", "reverse"], required: true },
    amount: { type: Number, required: true },
    status: { type: String, enum: ["pending", "completed", "failed"], required: true },
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
    reference: String,
    description: String,
    meta: Schema.Types.Mixed,
  },
  { timestamps: true }
);

const Transaction = model<ITransaction>("Transaction", transactionSchema);
export default Transaction;
