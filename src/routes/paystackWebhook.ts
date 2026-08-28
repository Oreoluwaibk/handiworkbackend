import { Request, Response } from "express";
import crypto from "crypto";
import User from "../schema/userSchema";
import Transaction from "../schema/transactionSchema";
import Wallet from "../schema/walletSchema";
import { saveNotifcation } from "../utils/saveNotification";
import { verifyPayment } from "../utils/paystack";
import { processTransaction } from "../utils/ledger";
import { normalizeEmail } from "../utils/authIdentity";

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY as string;

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

      const existing = await Transaction.findOne({ reference });
      if (!existing) {
        try {
          const verifyResponse = await verifyPayment(reference);

          if (verifyResponse.data.status === "success") {
            const { amount, customer } = verifyResponse.data;
            const user = await User.findOne({ email: normalizeEmail(customer.email) });

            if (user) {
              await processTransaction({
                user_id: user._id,
                type: "deposit",
                amount: amount / 100,
                description: `Paystack deposit (Ref: ${reference})`,
                reference,
              });
            }
          }
        } catch (err: any) {
          console.error("Paystack verification failed:", err.message);
        }
      }
    }

    if (event.event === "subscription.create" || event.event === "invoice.create") {
      const { customer, plan, amount } = event.data;
      const user = await User.findOne({ email: normalizeEmail(customer.email) });

      if (user) {
        await User.findByIdAndUpdate(user._id, {
          $set: {
            "subscription.plan_name": plan.name,
            "subscription.amount": amount / 100,
            "subscription.active": true,
            "subscription.renewed_at": new Date(),
          },
        });

        await saveNotifcation(
          "Subscription Renewed",
          `Your ${plan.name} plan has been renewed.`,
          user._id,
          "subscription"
        );
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
