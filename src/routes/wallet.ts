// wallet.routes.ts
import express from 'express';
import { authentication } from '../middleware/authentication';
import Wallet from '../schema/walletSchema';
import Transaction from '../schema/transactionSchema';
import { isInflow, isOutflow, sumBy } from '../utils/finance';

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

    const totalDeposits = sumBy(transactions, isInflow);
    const totalWithdrawals = sumBy(transactions, isOutflow);

    res.status(200).json({
      balance: wallet.balance,
      totalDeposits,
      totalWithdrawals,
      inflow: totalDeposits,
      outflow: totalWithdrawals,
    });
  } catch (error: any) {
    res.status(500).json({ message: error?.message });
  }
});

export default walletRouter;
