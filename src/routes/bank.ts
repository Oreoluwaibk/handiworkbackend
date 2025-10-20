import express from "express";
import axios from "axios";
import { authentication } from "../middleware/authentication";
import User from "../schema/userSchema";

const bankRouter = express.Router();

bankRouter
.get("/", authentication, async (req, res) => {
  try {
    const response = await axios.get("https://api.paystack.co/bank", {
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      },
    });
    res.status(200).json(response.data);
  } catch (error: any) {
    console.error("Error fetching banks:", error.response?.data || error.message);
    res.status(500).json({ message: "Unable to fetch banks" });
  }
})
.get("/details", authentication, async (req, res) => {
  try {
    const user = (req as any).user;

    const foundUser = await User.findById(user._id).select("bank_details");

    if (!foundUser) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!foundUser.bank_details || !foundUser.bank_details.verified) {
      return res.status(404).json({ message: "No verified bank details found" });
    }

    res.status(200).json({
      message: "Bank details retrieved successfully",
      data: foundUser.bank_details,
    });
  } catch (error: any) {
    console.error("Error fetching bank details:", error.message);
    res.status(500).json({
      message: "Unable to fetch bank details",
      error: error.message,
    });
  }
})
.post("/verify-account", authentication, async (req, res) => {
  const { account_number, bank_code } = req.body;
  const user = (req as any).user;

  try {
    // Step 1 — Resolve account number
    const resolve = await axios.get(
      `https://api.paystack.co/bank/resolve?account_number=${account_number}&bank_code=${bank_code}`,
      { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
    );

    const { account_name } = resolve.data.data;

    // Step 2 — Create transfer recipient
    const recipient = await axios.post(
      "https://api.paystack.co/transferrecipient",
      {
        type: "nuban",
        name: account_name,
        account_number,
        bank_code,
        currency: "NGN",
      },
      { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
    );

    const recipient_code = recipient.data.data.recipient_code;
    const bank_name = recipient.data.data.details.bank_name;

    // Step 3 — Save to user
    await User.findByIdAndUpdate(
      user._id,
      {
        $set: {
          bank_details: {
            account_name,
            account_number,
            bank_code,
            bank_name,
            recipient_code,
            verified: true,
          },
        },
      },
      { new: true }
    );

    res.status(200).json({
      message: "Bank account verified successfully",
      account_name,
      bank_name,
    });
  } catch (error: any) {
    console.error(error.response?.data || error.message);
    res.status(400).json({
      message: error.response?.data?.message || error.message,
    });
  }
});

export default bankRouter;
