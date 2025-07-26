// models/Wallet.ts
import { Schema, model, Types } from "mongoose";

export interface IWallet {
  user_id: Types.ObjectId;
  currency_code: string;
  balance: number;
  is_active: boolean;
}

const walletSchema = new Schema<IWallet>(
  {
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
    currency_code: { type: String, required: true, default: "NGN" },
    balance: { type: Number, required: true, default: 0 },
    is_active: { type: Boolean, required: true, default: true },
  },
  { timestamps: true }
);

const Wallet = model<IWallet>("Wallet", walletSchema);
export default Wallet;
