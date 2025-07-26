import express from 'express';
// import Transaction from '../models/transaction.model';
// import Wallet from '../models/wallet.model';
// import { authentication } from '../middlewares/auth.middleware';
// import User from '../models/user.model';
import bcrypt from 'bcryptjs';
import Wallet from '../schema/walletSchema';
import Transaction from '../schema/transactionSchema';
import { authentication } from '../middleware/authentication';
import User from '../schema/userSchema';
import Notification from '../schema/notificationScheme';

const transactionRouter = express.Router();

// Shared function to process a transaction
async function processTransaction({ user_id, type, amount, description }: {
  user_id: string;
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
    description: description || (type === 'deposit' ? 'Wallet deposit' : 'Wallet withdrawal'),
    status: "completed"
  });

  if (type === 'deposit') {
    wallet.balance += amount;
  } else if (type === 'withdraw') {
    wallet.balance -= amount;
  }
  const notification = await Notification.create({
    title: `Transaction - ${type}`,
    description: `${amount} has been ${type === 'deposit' ? 'deposited' : 'withdrawn'} from your wallet`,
    user_id: user_id
  });

  await transaction.save();
  await notification.save();

  await wallet.save();
  return transaction;
}

// Create transaction (general route, internal use or for admins)
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

transactionRouter.get("/",authentication,async (req, res) => {
  const user = (req as any).user;
  try {
    const transactions = await Transaction.find({ user_id: user._id });
    
    res.status(200).json(transactions);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

// Deposit route
transactionRouter.post('/deposit', authentication, async (req, res) => {
  const { amount, description, password } = req.body;
  const user = (req as any).user;
  const user_id = user._id;
  try {
    const user = await User.findById(user_id);
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      res.status(401).json({ message: 'Invalid password' });
      return;
    }
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

// Withdraw route with password validation
transactionRouter.post('/withdraw', authentication, async (req, res) => {
  const { password, amount, description } = req.body;
  const user = (req as any).user;
  const user_id = user._id;
  try {
    const user = await User.findById(user_id);
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      res.status(401).json({ message: 'Invalid password' });
      return;
    }

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
