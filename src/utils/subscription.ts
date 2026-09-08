import crypto from "crypto";
import User from "../schema/userSchema";
import { saveNotifcation } from "./saveNotification";
import { normalizeEmail } from "./authIdentity";

export function normalizePlanName(planName?: string | null, planType?: string | null) {
  const raw = String(planName || planType || "").trim();
  if (!raw) return "Basic Plan";

  const lower = raw.toLowerCase();
  if (lower.includes("premium")) return "Premium Plan";
  if (lower.includes("basic")) return "Basic Plan";
  if (lower.endsWith(" plan")) return raw.replace(/\b\w/g, (c) => c.toUpperCase());
  return `${raw} Plan`;
}

export async function activateUserSubscription({
  userId,
  planName,
  amount,
  reference,
  notify = true,
}: {
  userId: string;
  planName?: string | null;
  amount?: number | null;
  reference?: string | null;
  notify?: boolean;
}) {
  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  let referralCode = user.referral_code;
  if (!referralCode) {
    referralCode = `REF-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  }

  const normalizedPlan = normalizePlanName(planName);
  const updates: Record<string, any> = {
    "subscription.plan_name": normalizedPlan,
    "subscription.active": true,
    "subscription.renewed_at": new Date(),
    referral_code: referralCode,
    is_recommended: true,
  };

  if (typeof amount === "number" && Number.isFinite(amount)) {
    updates["subscription.amount"] = amount;
  }

  if (reference) {
    updates["subscription.reference"] = reference;
  }

  if (!user.subscription?.start_date) {
    updates["subscription.start_date"] = new Date();
  }

  const updated = await User.findByIdAndUpdate(
    userId,
    { $set: updates },
    { new: true }
  );

  if (notify) {
    await saveNotifcation(
      "Subscription Activated",
      `You are now subscribed to the ${normalizedPlan}.`,
      userId,
      "subscription"
    );
  }

  return updated;
}

export async function findUserByCustomerEmail(email?: string | null) {
  return User.findOne({ email: normalizeEmail(email) });
}
