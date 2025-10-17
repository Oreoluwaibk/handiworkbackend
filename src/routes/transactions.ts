import express from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import axios from 'axios';

import Wallet from '../schema/walletSchema';
import Transaction from '../schema/transactionSchema';
import { authentication } from '../middleware/authentication';
import User from '../schema/userSchema';
import Notification from '../schema/notificationScheme';

const transactionRouter = express.Router();

// Paystack keys
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY as string;
const PAYSTACK_BASE_URL = "https://api.paystack.co";

/* -------------------- UTIL: PROCESS TRANSACTION -------------------- */
export async function processTransaction({
  user_id,
  type,
  amount,
  description,
}: {
  user_id: string | any;
  type: 'deposit' | 'withdraw';
  amount: number;
  description?: string;
}) {
  const wallet = await Wallet.findOne({ user_id });
  if (!wallet || !wallet.is_active) throw new Error('Wallet not available');

  if (type === 'withdraw' && wallet.balance < amount) {
    throw new Error('Insufficient balance');
  }

  const transaction = new Transaction({
    user_id,
    type,
    amount,
    description:
      description || (type === 'deposit' ? 'Wallet deposit' : 'Wallet withdrawal'),
    status: 'completed',
  });

  if (type === 'deposit') {
    wallet.balance += amount;
  } else if (type === 'withdraw') {
    wallet.balance -= amount;
  }

  const notification = await Notification.create({
    title: `Transaction - ${type}`,
    description: `${amount} has been ${
      type === 'deposit' ? 'deposited' : 'withdrawn'
    } from your wallet`,
    user_id: user_id,
  });

  await transaction.save();
  await notification.save();
  await wallet.save();

  return transaction;
}

/* -------------------- PAYSTACK HELPERS -------------------- */
async function initializePayment({
  email,
  amount,
}: {
  email: string;
  amount: number;
}) {
  const response = await axios.post(
    `${PAYSTACK_BASE_URL}/transaction/initialize`,
    { email, amount: amount * 100 }, // Paystack expects kobo
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

/* -------------------- ROUTES -------------------- */

// General create (admin/internal)
transactionRouter.post('/create', authentication, async (req, res) => {
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

// Get all transactions
transactionRouter.get('/', authentication, async (req, res) => {
  const user = (req as any).user;
  try {
    const transactions = await Transaction.find({ user_id: user._id });
    res.status(200).json(transactions);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

/* -------------------- OLD DEPOSIT (Password protected) -------------------- */
transactionRouter.post('/deposit', authentication, async (req, res) => {
  const { amount, description, password } = req.body;
  const user = (req as any).user;
  const user_id = user._id;
  try {
    const user = await User.findById(user_id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const isValid = await bcrypt.compare(password, user.password);
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

/* -------------------- PAYSTACK DEPOSIT -------------------- */
// Initialize Paystack payment
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

// Verify manually (frontend can call this after payment if webhook fails)
transactionRouter.get('/deposit/verify/:reference', authentication, async (req, res) => {
  const { reference } = req.params;
  const user = (req as any).user;

  try {
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
    });

    res.status(200).json({ message: 'Wallet credited successfully' });
  } catch (error: any) {
    res.status(400).json({ message: error.response?.data || error.message });
  }
});

/* -------------------- SUBSCRIPTIONS -------------------- */

const PAYSTACK_BASIC_PLAN = process.env.PAYSTACK_BASIC_PLAN as string;
const PAYSTACK_PREMIUM_PLAN = process.env.PAYSTACK_PREMIUM_PLAN as string;


/* -------------------- INITIALIZE SUBSCRIPTION -------------------- */
transactionRouter.post("/subscribe", authentication, async (req, res) => {
  const { planType } = req.body; // "basic" or "premium"
  const user = (req as any).user;

  try {
    const planCode =
      planType === "premium" ? PAYSTACK_PREMIUM_PLAN : PAYSTACK_BASIC_PLAN;

    if (!planCode)
      return res.status(400).json({ message: "Invalid plan selected" });

    const amount = planType === "premium" ? 1500 * 100 : 1000 * 100;

    // Initialize Paystack transaction
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
    res
      .status(400)
      .json({ message: error.response?.data?.message || error.message });
  }
});

/* -------------------- VERIFY SUBSCRIPTION -------------------- */
transactionRouter.get(
  "/subscribe/verify/:reference",
  authentication,
  async (req, res) => {
    const { reference } = req.params;
    const user = (req as any).user;

    try {
      const verifyResponse = await verifyPayment(reference);
      const data = verifyResponse.data;

      if (data.status !== "success") {
        return res.status(400).json({ message: "Subscription not successful" });
      }

      // Safely extract plan info
      const planName = `${data.plan_object?.name} Plan` || "Basic Plan";
      const amount = (data.amount || 0) / 100;

      const existingUser = await User.findById(user._id);
      let referralCode = existingUser?.referral_code;

      if (!referralCode) {
        referralCode = `REF-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
      }

      await User.findByIdAndUpdate(
        user._id,
        {
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
        },
        { new: true }
      );

      // Create a notification for user
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
  }
);

/* -------------------- GET USER SUBSCRIPTION -------------------- */
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


/* -------------------- PAYSTACK WEBHOOK -------------------- */
transactionRouter.post(
  '/paystack/webhook',
  express.json({ type: '*/*' }),
  async (req, res) => {
    const secret = PAYSTACK_SECRET;

    // Validate signature
    const hash = crypto
      .createHmac('sha512', secret)
      .update(JSON.stringify(req.body))
      .digest('hex');

    if (hash !== req.headers['x-paystack-signature']) {
      return res.status(401).json({ message: 'Invalid signature' });
    }

    const event = req.body;

    if (event.event === 'charge.success') {
      const { reference } = event.data;

      try {
        // ✅ verify transaction with Paystack API
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
            });
          }
        }
      } catch (err: any) {
        console.error('Paystack verification failed:', err.message);
      }
    }

    res.sendStatus(200);
  }
);
/* -------------------- SUBSCRIPTION WEBHOOK -------------------- */
transactionRouter.post(
  '/paystack/subscription-webhook',
  express.json({ type: '*/*' }),
  async (req, res) => {
    const hash = crypto
      .createHmac('sha512', PAYSTACK_SECRET)
      .update(JSON.stringify(req.body))
      .digest('hex');

    if (hash !== req.headers['x-paystack-signature']) {
      return res.status(401).json({ message: 'Invalid signature' });
    }

    const event = req.body;

    if (event.event === 'subscription.create' || event.event === 'invoice.create') {
      const { customer, plan, amount } = event.data;
      const user = await User.findOne({ email: customer.email });

      if (user) {
        await User.findByIdAndUpdate(user._id, {
          subscription: {
            plan_name: plan.name,
            amount: amount / 100,
            active: true,
            renewed_at: new Date(),
          },
        });

        await Notification.create({
          title: 'Subscription Renewed',
          description: `Your ${plan.name} plan has been renewed.`,
          user_id: user._id,
        });
      }
    }

    res.sendStatus(200);
  }
);

/* -------------------- WITHDRAW -------------------- */
transactionRouter.post('/withdraw', authentication, async (req, res) => {
  const { password, amount, description } = req.body;
  const user = (req as any).user;
  const user_id = user._id;
  try {
    const user = await User.findById(user_id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) return res.status(401).json({ message: 'Invalid password' });

    const transaction = await processTransaction({
      user_id,
      type: 'withdraw',
      amount: parseFloat(amount),
      description,
    });

    res.status(200).json(transaction);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});



export default transactionRouter;
