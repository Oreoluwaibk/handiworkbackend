import { Request, Response } from "express";
import crypto from "crypto";
import User from "../schema/userSchema";
import Transaction from "../schema/transactionSchema";
import Wallet from "../schema/walletSchema";
import { saveNotifcation } from "../utils/saveNotification";
import { verifyPayment } from "../utils/paystack";
import { processTransaction } from "../utils/ledger";
import { normalizeEmail } from "../utils/authIdentity";
import {
  activateUserSubscription,
  findUserByCustomerEmail,
  normalizePlanName,
} from "../utils/subscription";

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY as string;

function isSubscriptionCharge(data: any) {
  const metadata = data?.metadata || {};
  return (
    metadata.purpose === "subscription" ||
    Boolean(data?.plan) ||
    Boolean(data?.plan_object) ||
    Boolean(metadata.planType)
  );
}

export async function handlePaystackWebhook(req: Request, res: Response) {
  try {
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));
    const signature = req.headers["x-paystack-signature"];

    const hash = crypto.createHmac("sha512", PAYSTACK_SECRET).update(rawBody).digest("hex");

    if (hash !== signature) {
      return res.status(401).json({ message: "Invalid signature" });
    }

    const event = JSON.parse(rawBody.toString("utf8"));

    if (event.event === "charge.success") {
      const { reference } = event.data;

      try {
        const verifyResponse = await verifyPayment(reference);
        if (verifyResponse.data.status === "success") {
          const data = verifyResponse.data;
          const { amount, customer } = data;
          const user =
            (await findUserByCustomerEmail(customer?.email)) ||
            (data.metadata?.user_id
              ? await User.findById(data.metadata.user_id)
              : null);

          if (user && isSubscriptionCharge(data)) {
            const alreadyActive =
              user.subscription?.active && user.subscription?.reference === reference;

            if (!alreadyActive) {
              await activateUserSubscription({
                userId: user._id.toString(),
                planName: normalizePlanName(
                  data.plan_object?.name || data.plan?.name || data.metadata?.planType,
                  data.metadata?.planType
                ),
                amount: amount / 100,
                reference,
              });
            }
          } else if (user) {
            const existing = await Transaction.findOne({ reference });
            if (!existing) {
              await processTransaction({
                user_id: user._id,
                type: "deposit",
                amount: amount / 100,
                description: `Paystack deposit (Ref: ${reference})`,
                reference,
              });
            }
          }
        }
      } catch (err: any) {
        console.error("Paystack verification failed:", err.message);
      }
    }

    if (event.event === "subscription.create" || event.event === "invoice.create") {
      const { customer, plan, amount, reference } = event.data;
      const user = await findUserByCustomerEmail(customer?.email);

      if (user) {
        await activateUserSubscription({
          userId: user._id.toString(),
          planName: normalizePlanName(plan?.name),
          amount: amount / 100,
          reference: reference || user.subscription?.reference,
          notify: event.event === "subscription.create",
        });
      }
    }

    if (event.event === "transfer.success") {
      const { reference, recipient, amount } = event.data;

      const transaction = await Transaction.findOne({ reference });
      if (transaction && transaction.status !== "completed") {
        transaction.status = "completed";
        await transaction.save();
      }

      const user = await User.findOne({
        "bank_details.recipient_code": recipient.recipient_code,
      });

      if (user) {
        await saveNotifcation(
          "Withdrawal Successful",
          `₦${amount / 100} has been successfully transferred to your account.`,
          user._id,
          "transaction",
          reference
        );
      }
    }

    if (event.event === "transfer.failed") {
      const { reference, reason } = event.data;

      const transaction = await Transaction.findOne({ reference });
      if (transaction && transaction.status !== "failed") {
        transaction.status = "failed";
        await transaction.save();

        const wallet = await Wallet.findOne({ user_id: transaction.user_id });
        if (wallet) {
          wallet.balance += transaction.amount;
          await wallet.save();
        }

        await saveNotifcation(
          "Withdrawal Failed",
          `Your withdrawal of ₦${transaction.amount} failed: ${reason}. The amount has been refunded to your wallet.`,
          transaction.user_id,
          "transaction",
          transaction._id.toString()
        );
      }
    }

    return res.sendStatus(200);
  } catch (error: any) {
    console.error("Paystack webhook error:", error.message);
    return res.status(500).json({ message: "Webhook handling failed", error: error.message });
  }
}
