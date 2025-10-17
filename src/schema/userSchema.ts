import { Schema, model } from "mongoose";

interface IUser {
  first_name: string;
  last_name?: string;
  phone_number: string;
  password: string;
  picture?: string;
  address: string;
  address_line2?: string;
  postal_code?: any;
  state: string;
  country: string;
  email: string;
  skill?: string[];
  area: string;
  is_vendor: boolean;
  is_recommended?: boolean;
  is_verified: boolean;
  is_active: boolean;
  resetToken: string;
  otp?: number | null;
  bio?: string;
  nin?: string;
  chat_id?: string;
  is_deleted: boolean;
  work_images?: string[];
  referral_code?: string;
  referred_by?: string | null;

  // 🔹 Added subscription field
  subscription?: {
    plan_name: string | null;
    amount: number;
    reference?: string;
    active: boolean;
    start_date?: Date;
    renewed_at?: Date;
  };
}

const userSchema = new Schema<IUser>(
  {
    first_name: { required: true, type: String },
    last_name: { required: false, type: String },
    phone_number: { required: false, type: String },
    picture: { required: false, type: String, default: null },
    bio: { required: false, type: String, default: "" },
    password: { required: true, type: String },
    resetToken: { required: false, type: String },
    otp: { required: false, type: Number },
    address: { required: false, type: String, default: null },
    area: { required: false, type: String },
    postal_code: { required: false, type: String },
    state: { required: false, type: String },
    country: { required: false, type: String },
    email: { required: true, type: String },
    skill: { required: false, type: Array, default: [] },
    is_vendor: { required: true, type: Boolean, default: false },
    is_recommended: { required: false, type: Boolean, default: false },
    is_verified: { required: false, type: Boolean, default: false },
    is_active: { required: false, type: Boolean, default: false },
    nin: { required: false, type: String, default: null },
    chat_id: { type: String, required: false, default: null },
    is_deleted: { type: Boolean, required: true, default: false },
    work_images: { required: false, type: Array, default: [] },
    referral_code: { type: String, required: false, unique: true, sparse: true },
    referred_by: { type: String, required: false, default: null },

    // ✅ Subscription section
    subscription: {
      plan_name: { type: String, default: null },
      amount: { type: Number, default: 0 },
      reference: { type: String, default: null },
      active: { type: Boolean, default: false },
      start_date: { type: Date, default: null },
      renewed_at: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

export { userSchema };

const User = model<IUser>("user", userSchema);
export default User;
