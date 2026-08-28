import express from 'express';
import crypto from 'crypto';
import axios from 'axios';

import Wallet from '../schema/walletSchema';
import Transaction from '../schema/transactionSchema';
import { authentication } from '../middleware/authentication';
import { requireAdminKey } from '../middleware/adminAuth';
import User from '../schema/userSchema';
import { saveNotifcation } from '../utils/saveNotification';
import { confirmUserPassword } from '../utils/password';
import { requesterHasActiveEscrow } from '../utils/quoteEscrow';
import { processTransaction, validateTransactionAmount } from '../utils/ledger';
import { verifyPayment } from '../utils/paystack';
import { normalizeEmail } from '../utils/authIdentity';
import { moneyLimiter } from '../middleware/rateLimit';

const transactionRouter = express.Router();

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY as string;
const PAYSTACK_BASE_URL = "https://api.paystack.co";

transactionRouter.use(moneyLimiter);

async function initializePayment({
  email,
  amount,
}: {
  email: string;
  amount: number;
}) {
  const response = await axios.post(
    `${PAYSTACK_BASE_URL}/transaction/initialize`,
    { email, amount: amount * 100 },
    { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } }
  );
  return response.data;
}

transactionRouter.post('/create', authentication, requireAdminKey, async (req, res) => {
  const { user_id, type, amount, description } = req.body;

  try {
    const transaction = await processTransaction({
      user_id,
      type,
      amount: parseFloat(amount),
      description,
    });
    res.status(201).json(transaction);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

transactionRouter.get('/', authentication, async (req, res) => {
  const user = (req as any).user;

  try {
    const transactions = await Transaction.find({ user_id: user._id });
    res.status(200).json(transactions);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

transactionRouter.post('/deposit', authentication, async (req, res) => {
  const { amount, description, password } = req.body;
  const user = (req as any).user;
  const user_id = user._id;

  try {
    const dbUser = await User.findById(user_id);
    if (!dbUser) return res.status(404).json({ message: 'User not found' });

    const passwordCheck = confirmUserPassword(dbUser, password);
    if (!passwordCheck.ok) return res.status(passwordCheck.status).json({ message: passwordCheck.message });

    const parsedAmount = parseFloat(amount);
    validateTransactionAmount(parsedAmount);

    const transaction = await processTransaction({
      user_id,
      type: 'deposit',
      amount: parsedAmount,
      description,
    });
    res.status(200).json(transaction);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

transactionRouter.post('/deposit/paystack', authentication, async (req, res) => {
  const { amount, password } = req.body;
  const user = (req as any).user;

  try {
    const passwordCheck = confirmUserPassword(user, password);
    if (!passwordCheck.ok) return res.status(passwordCheck.status).json({ message: passwordCheck.message });

    const parsedAmount = parseFloat(amount);
    validateTransactionAmount(parsedAmount);

    const initResponse = await initializePayment({
      email: user.email,
      amount: parsedAmount,
    });

    res.status(200).json({
      authorization_url: initResponse.data.authorization_url,
      access_code: initResponse.data.access_code,
      reference: initResponse.data.reference,
    });
  } catch (error: any) {
    res.status(400).json({ message: error.response?.data || error.message });
  }
});

transactionRouter.get('/deposit/verify/:reference', authentication, async (req, res) => {
  const { reference } = req.params;
  const user = (req as any).user;

  try {
    const existing = await Transaction.findOne({ reference });
    if (existing) {
      return res.status(200).json({ message: 'Wallet already credited for this reference' });
    }

    const verifyResponse = await verifyPayment(reference);

    if (verifyResponse.data.status !== 'success') {
      return res.status(400).json({ message: 'Payment not successful' });
    }

    const payerEmail = normalizeEmail(verifyResponse.data.customer?.email);
    const userEmail = normalizeEmail(user.email);
    if (!payerEmail || payerEmail !== userEmail) {
      return res.status(403).json({ message: 'Payment does not belong to this account' });
    }

    const { amount } = verifyResponse.data;

    await processTransaction({
      user_id: user._id,
      type: 'deposit',
      amount: amount / 100,
      description: `Paystack manual verify (Ref: ${reference})`,
      reference,
    });

    res.status(200).json({ message: 'Wallet credited successfully' });
  } catch (error: any) {
    res.status(400).json({ message: error.response?.data || error.message });
  }
});

const PAYSTACK_BASIC_PLAN = process.env.PAYSTACK_BASIC_PLAN as string;
const PAYSTACK_PREMIUM_PLAN = process.env.PAYSTACK_PREMIUM_PLAN as string;

transactionRouter.post("/subscribe", authentication, async (req, res) => {
  const { planType } = req.body;
  const user = (req as any).user;

  try {
    const planCode =
      planType === "premium" ? PAYSTACK_PREMIUM_PLAN : PAYSTACK_BASIC_PLAN;

    if (!planCode) {
      return res.status(400).json({ message: "Invalid plan selected" });
    }

    const amount = planType === "premium" ? 1500 * 100 : 1000 * 100;

    const response = await axios.post(
      `${PAYSTACK_BASE_URL}/transaction/initialize`,
      {
        email: user.email,
        amount,
        plan: planCode,
      },
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET}`,
          "Content-Type": "application/json",
        },
      }
    );

    const data = response.data.data;

    res.status(200).json({
      authorization_url: data.authorization_url,
      access_code: data.access_code,
      reference: data.reference,
      planType,
    });
  } catch (error: any) {
    console.error("Subscription init error:", error.response?.data || error);
    res.status(400).json({ message: error.response?.data?.message || error.message });
  }
});

transactionRouter.get("/subscribe/verify/:reference", authentication, async (req, res) => {
  const { reference } = req.params;
  const user = (req as any).user;

  try {
    const existingUser = await User.findById(user._id);
    if (
      existingUser?.subscription?.reference === reference &&
      existingUser.subscription.active
    ) {
      return res.status(200).json({
        message: "Subscription already active",
        plan: existingUser.subscription.plan_name,
      });
    }

    const verifyResponse = await verifyPayment(reference);
    const data = verifyResponse.data;

    if (data.status !== "success") {
      return res.status(400).json({ message: "Subscription not successful" });
    }

    const payerEmail = normalizeEmail(data.customer?.email);
    const userEmail = normalizeEmail(user.email);
    if (!payerEmail || payerEmail !== userEmail) {
      return res.status(403).json({ message: "Payment does not belong to this account" });
    }

    const planName = data.plan_object?.name
      ? `${data.plan_object.name} Plan`
      : "Basic Plan";
    const amount = (data.amount || 0) / 100;

    let referralCode = existingUser?.referral_code;

    if (!referralCode) {
      referralCode = `REF-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
    }

    await User.findByIdAndUpdate(user._id, {
      $set: {
        "subscription.plan_name": planName,
        "subscription.amount": amount,
        "subscription.reference": reference,
        "subscription.active": true,
        "subscription.start_date": new Date(),
        "subscription.renewed_at": new Date(),
        referral_code: referralCode,
        is_recommended: true,
      },
    });

    await saveNotifcation(
      "Subscription Activated",
      `You are now subscribed to the ${planName} plan.`,
      user._id,
      "subscription"
    );

    res.status(200).json({
      message: "Subscription verified and activated successfully",
      plan: planName,
    });
  } catch (error: any) {
    console.error("Subscription verification error:", error.response?.data || error);
    res.status(400).json({ message: error.response?.data?.message || error.message });
  }
});

transactionRouter.get('/subscription', authentication, async (req, res) => {
  const user = (req as any).user;

  try {
    const foundUser = await User.findById(user._id).select('subscription first_name last_name email');

    if (!foundUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!foundUser.subscription || !foundUser.subscription.active) {
      return res.status(200).json({
        active: false,
        message: 'No active subscription found',
        subscription: null,
      });
    }

    res.status(200).json({
      active: true,
      subscription: foundUser.subscription,
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

transactionRouter.post("/admin/reset-wallets", requireAdminKey, async (req, res) => {
  try {
    const { clear_transactions } = req.body;

    await Wallet.updateMany({}, { $set: { balance: 0 } });

    if (clear_transactions) {
      await Transaction.deleteMany({});
    }

    res.status(200).json({
      message: `All wallet balances have been reset to 0${
        clear_transactions ? " and all transactions cleared" : ""
      }.`,
    });
  } catch (error: any) {
    console.error("Reset wallets error:", error.message);
    res.status(500).json({
      message: "Failed to reset wallets",
      error: error.message,
    });
  }
});

transactionRouter.post("/withdraw", authentication, async (req, res) => {
  const user = (req as any).user;
  const { amount, password } = req.body;

  try {
    const passwordCheck = confirmUserPassword(user, password);
    if (!passwordCheck.ok) return res.status(passwordCheck.status).json({ message: passwordCheck.message });

    const withdrawalAmount = Number(amount);
    validateTransactionAmount(withdrawalAmount);

    const dbUser = await User.findById(user._id).select("bank_details");
    if (!dbUser?.bank_details?.verified || !dbUser.bank_details.recipient_code) {
      return res.status(400).json({
        message: "Please verify your bank account before withdrawing",
      });
    }

    const wallet = await Wallet.findOne({ user_id: user._id });
    if (!wallet) return res.status(404).json({ message: "Wallet not found" });

    const hasActiveJob = await requesterHasActiveEscrow(user._id.toString());
    if (hasActiveJob) {
      return res.status(400).json({
        message: "Withdrawals are locked while you have an active accepted job. Complete or verify the job first.",
      });
    }

    if (wallet.balance < withdrawalAmount) {
      return res.status(400).json({ message: "Insufficient wallet balance" });
    }

    const transferResponse = await axios.post(
      "https://api.paystack.co/transfer",
      {
        source: "balance",
        amount: withdrawalAmount * 100,
        recipient: dbUser.bank_details.recipient_code,
        reason: "Wallet withdrawal",
      },
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET}`,
          "Content-Type": "application/json",
        },
      }
    );

    const transferReference = transferResponse.data.data.reference;

    await processTransaction({
      user_id: user._id,
      type: "withdraw",
      amount: withdrawalAmount,
      description: "Wallet withdrawal to bank account",
      status: "pending",
      reference: transferReference,
    });

    res.status(200).json({
      message: "Withdrawal initiated successfully",
      transfer: transferResponse.data.data,
    });
  } catch (error: any) {
    console.error("Withdrawal error:", error.response?.data || error.message);
    res.status(400).json({
      message: error.response?.data?.message || error.message,
    });
  }
});

transactionRouter.get('/:id', authentication, async (req, res) => {
  const user = (req as any).user;

  try {
    const transaction = await Transaction.findOne({
      _id: req.params.id,
      user_id: user._id,
    });

    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    res.status(200).json({ transaction });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

export { processTransaction };
export default transactionRouter;
