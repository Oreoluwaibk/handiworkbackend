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

  // 🔹 Subscription
  subscription?: {
    plan_name: string | null;
    amount: number;
    reference?: string | null;
    active: boolean;
    start_date?: Date | null;
    renewed_at?: Date | null;
  };

  // ✅ FIXED TYPE (No more { type: String })
  bank_details?: {
    account_name?: string | null;
    account_number?: string | null;
    bank_code?: string | null;
    bank_name?: string | null;
    recipient_code?: string | null;
    verified: boolean;
  };

 // ✅ ADD THESE
  createdAt: Date;
  updatedAt: Date;
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
    skill: { required: false, type: [String], default: [] },
    is_vendor: { required: true, type: Boolean, default: false },
    is_recommended: { required: false, type: Boolean, default: false },
    is_verified: { required: false, type: Boolean, default: false },
    is_active: { required: false, type: Boolean, default: false },
    nin: { required: false, type: String, default: null },
    chat_id: { type: String, required: false, default: null },
    is_deleted: { type: Boolean, required: true, default: false },
    work_images: { required: false, type: [String], default: [] },
    referral_code: { type: String, required: false, },
    referred_by: { type: String, required: false, default: null },

    // ✅ Subscription
    subscription: {
      plan_name: { type: String, default: null },
      amount: { type: Number, default: 0 },
      reference: { type: String, default: null },
      active: { type: Boolean, default: false },
      start_date: { type: Date, default: null },
      renewed_at: { type: Date, default: null },
    },

    // ✅ Bank Details
    bank_details: {
      account_name: { type: String, default: "" },
      account_number: { type: String, default: null },
      bank_code: { type: String, default: null },
      bank_name: { type: String, default: null },
      recipient_code: { type: String, default: null },
      verified: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);
// ✅ Virtual: Has Active Access
// ✅ Virtual: Has Active Access
userSchema.virtual("has_access").get(function () {
  const now = new Date();

  // 🔹 Vendors MUST have active subscription
  if (this.is_vendor) {
    return this.subscription?.active === true;
  }

  // 🔹 Normal users: free for 6 months
  if (this.createdAt) {
    const sixMonthsAfterSignup = new Date(this.createdAt);
    sixMonthsAfterSignup.setMonth(sixMonthsAfterSignup.getMonth() + 6);

    if (now <= sixMonthsAfterSignup) {
      return true;
    }
  }

  // 🔹 After 6 months → must subscribe (if subscription exists)
  return this.subscription?.active === true;
});

// 🔹 Make virtuals available in JSON responses
userSchema.set("toJSON", { virtuals: true });
userSchema.set("toObject", { virtuals: true });



const User = model<IUser>("user", userSchema);

export { userSchema };
export default User;
