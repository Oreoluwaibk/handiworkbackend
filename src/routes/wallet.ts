// wallet.routes.ts
import express from 'express';
import { authentication } from '../middleware/authentication';
import Wallet from '../schema/walletSchema';
import Transaction from '../schema/transactionSchema';

const walletRouter = express.Router();

walletRouter.get('/', authentication, async (req, res) => {
    const user = (req as any).user;

  try {
    const wallet = await Wallet.findOne({ user_id: user._id });
    if (!wallet)  {
        res.status(404).json({ message: 'Wallet not found' });
        return
    }
    res.status(200).json(wallet);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

walletRouter.get('/stats', authentication, async (req, res) => {
    const user = (req as any).user;

  try {
    const wallet = await Wallet.findOne({ user_id: user._id });
    if (!wallet)  {
        res.status(404).json({ message: 'Wallet not found' });
        return;
    }

    const transactions = await Transaction.find({ user_id: user._id });

    const totalDeposits = transactions
      .filter(t => t.type === 'deposit')
      .reduce((acc, curr) => acc + Number(curr.amount), 0);

    const totalWithdrawals = transactions
      .filter(t => t.type === 'withdraw')
      .reduce((acc, curr) => acc + Number(curr.amount), 0);

    res.status(200).json({
      balance: wallet.balance,
      totalDeposits,
      totalWithdrawals,
    //   transactions
    });
  } catch (error: any) {
    res.status(500).json({ message: error?.message });
  }
});

export default walletRouter;
