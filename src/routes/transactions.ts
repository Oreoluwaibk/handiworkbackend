import express from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import axios from 'axios';

import Wallet from '../schema/walletSchema';
import Transaction from '../schema/transactionSchema';
import { authentication } from '../middleware/authentication';
import { requireAdminKey } from '../middleware/adminAuth';
import User from '../schema/userSchema';
import Notification from '../schema/notificationScheme';

const transactionRouter = express.Router();

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY as string;
const PAYSTACK_BASE_URL = "https://api.paystack.co";

type TransactionType = 'deposit' | 'withdraw' | 'debit' | 'reverse';

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
  if (reference) {
    const existing = await Transaction.findOne({ reference });
    if (existing) return existing;
  }

  const wallet = await Wallet.findOne({ user_id });
  if (!wallet || !wallet.is_active) throw new Error('Wallet not available');

  const isDebit = type === 'withdraw' || type === 'debit';

  if (isDebit && wallet.balance < amount) {
    throw new Error('Insufficient balance');
  }

  const transaction = new Transaction({
    user_id,
    type,
    amount,
    description:
      description || (type === 'deposit' ? 'Wallet deposit' : 'Wallet withdrawal'),
    status,
    reference,
  });

  if (type === 'deposit') {
    wallet.balance += amount;
  } else if (isDebit) {
    wallet.balance -= amount;
  }

  if (status === 'completed') {
    await Notification.create({
      title: `Transaction - ${type}`,
      description: `${amount} has been ${
        type === 'deposit' ? 'deposited to' : 'withdrawn from'
      } your wallet`,
      user_id,
    });
  }

  await transaction.save();
  await wallet.save();

  return transaction;
}

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

async function verifyPayment(reference: string) {
  const response = await axios.get(
    `${PAYSTACK_BASE_URL}/transaction/verify/${reference}`,
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

    const isValid = await bcrypt.compare(password, dbUser.password);
    if (!isValid) return res.status(401).json({ message: 'Invalid password' });

    const transaction = await processTransaction({
      user_id,
      type: 'deposit',
      amount: parseFloat(amount),
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
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) return res.status(401).json({ message: 'Invalid password' });

    const initResponse = await initializePayment({
      email: user.email,
      amount: parseFloat(amount),
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
    const verifyResponse = await verifyPayment(reference);
    const data = verifyResponse.data;

    if (data.status !== "success") {
      return res.status(400).json({ message: "Subscription not successful" });
    }

    const planName = data.plan_object?.name
      ? `${data.plan_object.name} Plan`
      : "Basic Plan";
    const amount = (data.amount || 0) / 100;

    const existingUser = await User.findById(user._id);
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

    await Notification.create({
      title: "Subscription Activated",
      description: `You are now subscribed to the ${planName} plan.`,
      user_id: user._id,
    });

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

transactionRouter.post(
  '/paystack/webhook',
  express.json({ type: '*/*' }),
  async (req, res) => {
    try {
      const hash = crypto
        .createHmac('sha512', PAYSTACK_SECRET)
        .update(JSON.stringify(req.body))
        .digest('hex');

      if (hash !== req.headers['x-paystack-signature']) {
        return res.status(401).json({ message: 'Invalid signature' });
      }

      const event = req.body;

      if (event.event === 'charge.success') {
        const { reference } = event.data;

        const existing = await Transaction.findOne({ reference });
        if (!existing) {
          try {
            const verifyResponse = await verifyPayment(reference);

            if (verifyResponse.data.status === 'success') {
              const { amount, customer } = verifyResponse.data;
              const user = await User.findOne({ email: customer.email });

              if (user) {
                await processTransaction({
                  user_id: user._id,
                  type: 'deposit',
                  amount: amount / 100,
                  description: `Paystack deposit (Ref: ${reference})`,
                  reference,
                });
              }
            }
          } catch (err: any) {
            console.error('Paystack verification failed:', err.message);
          }
        }
      }

      if (
        event.event === "subscription.create" ||
        event.event === "invoice.create"
      ) {
        const { customer, plan, amount } = event.data;
        const user = await User.findOne({ email: customer.email });

        if (user) {
          await User.findByIdAndUpdate(user._id, {
            $set: {
              "subscription.plan_name": plan.name,
              "subscription.amount": amount / 100,
              "subscription.active": true,
              "subscription.renewed_at": new Date(),
            },
          });

          await Notification.create({
            title: "Subscription Renewed",
            description: `Your ${plan.name} plan has been renewed.`,
            user_id: user._id,
          });
        }
      }

      if (event.event === "transfer.success") {
        const { reference, recipient, amount } = event.data;

        const transaction = await Transaction.findOne({ reference });
        if (transaction) {
          transaction.status = "completed";
          await transaction.save();
        }

        const user = await User.findOne({
          "bank_details.recipient_code": recipient.recipient_code,
        });

        if (user) {
          await Notification.create({
            title: "Withdrawal Successful",
            description: `₦${amount / 100} has been successfully transferred to your account.`,
            user_id: user._id,
          });
        }
      }

      if (event.event === "transfer.failed") {
        const { reference, reason } = event.data;

        const transaction = await Transaction.findOne({ reference });
        if (transaction) {
          transaction.status = "failed";
          await transaction.save();

          const wallet = await Wallet.findOne({ user_id: transaction.user_id });
          if (wallet) {
            wallet.balance += transaction.amount;
            await wallet.save();
          }

          await Notification.create({
            title: "Withdrawal Failed",
            description: `Your withdrawal of ₦${transaction.amount} failed: ${reason}. The amount has been refunded to your wallet.`,
            user_id: transaction.user_id,
          });
        }
      }

      res.sendStatus(200);
    } catch (error: any) {
      console.error("Paystack webhook error:", error.message);
      res.status(500).json({ message: "Webhook handling failed", error: error.message });
    }
  }
);

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
  const { account_number, bank_code, amount, account_name, password } = req.body;

  try {
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) return res.status(401).json({ message: 'Invalid password' });

    const withdrawalAmount = Number(amount);

    if (withdrawalAmount <= 0) {
      return res.status(400).json({ message: "Invalid withdrawal amount" });
    }

    const wallet = await Wallet.findOne({ user_id: user._id });
    if (!wallet) return res.status(404).json({ message: "Wallet not found" });

    if (wallet.balance < withdrawalAmount) {
      return res.status(400).json({ message: "Insufficient wallet balance" });
    }

    const recipientResponse = await axios.post(
      "https://api.paystack.co/transferrecipient",
      {
        type: "nuban",
        name: account_name,
        account_number,
        bank_code,
        currency: "NGN",
      },
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET}`,
          "Content-Type": "application/json",
        },
      }
    );

    const recipientCode = recipientResponse.data.data.recipient_code;

    const transferResponse = await axios.post(
      "https://api.paystack.co/transfer",
      {
        source: "balance",
        amount: withdrawalAmount * 100,
        recipient: recipientCode,
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

export default transactionRouter;
