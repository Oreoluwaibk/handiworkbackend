import { Request, Response, Router } from "express";
import { authentication } from "../middleware/authentication";
import User from "../schema/userSchema";
import Quotes from "../schema/quoteSchema";
import { getPagination } from "../utils/pagination";
import { saveNotifcation } from "../utils/saveNotification";
import { processTransaction } from "./transactions";
import mongoose from "mongoose";
import Wallet from "../schema/walletSchema";

const quoteRouter = Router();

function isRequester(quote: any, user: any) {
  return quote.requester?.id?.toString() === user._id.toString();
}

function isVendor(quote: any, user: any) {
  return quote.vendor?.id?.toString() === user._id.toString();
}

quoteRouter
.get("/", authentication, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { status } = req.query;

  try {
    const { limit, skip, page } = getPagination(req);

    const query: any = { "requester.id": user._id };
    if (status) {
      query.status = status;
    }

    const [quotes, total] = await Promise.all([
      Quotes.find(query).skip(skip).limit(limit),
      Quotes.countDocuments(query),
    ]);

    const userIds = [
      ...new Set(quotes.flatMap((q) => [q.requester.id, q.vendor.id])),
    ];

    const objectIds = userIds.map((id) => new mongoose.Types.ObjectId(id));
    const users = await User.find({ _id: { $in: objectIds } }).select("chat_id");
    const userMap = users.reduce((map, u) => {
      map[u._id.toString()] = u.chat_id ?? null;
      return map;
    }, {} as Record<string, string | null>);

    const responseQuotes: any[] = quotes.map((q) => ({
      ...q.toObject(),
      requester_chat_id: userMap[q.requester.id] ?? null,
      vendor_chat_id: userMap[q.vendor.id] ?? null,
    }));

    res.status(200).json({
      message: "Success",
      quotes: responseQuotes,
      page,
      total,
      pages: Math.ceil(total / limit),
    });
  } catch (error: any) {
    res.status(500).json({ message: `Unable to get quotes: ${error.message}` });
  }
})
.put("/accept/:id", authentication, async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = (req as any).user;

  try {
    const quote = await Quotes.findById(id);

    if (!quote) {
      res.status(404).json({ message: "Quote not found!" });
      return;
    }

    if (!isRequester(quote, user)) {
      res.status(403).json({ message: "Only the requester can accept this quote" });
      return;
    }

    const vendor = await User.findById(quote.vendor.id);

    if (!quote.amount) {
      res.status(400).json({ message: "You cannot accept quote if not replied" });
      return;
    }

    const wallet = await Wallet.findOne({ user_id: quote.requester.id });
    if (!wallet) {
      res.status(404).json({ message: 'You cannot accept this quote if you have no money in your wallet!' });
      return;
    }

    if (parseFloat(wallet.balance.toString()) < parseFloat(quote.amount.toString())) {
      res.status(400).json({ message: 'You cannot accept quote more than your account balance!' });
      return;
    }

    if (vendor?.is_active) {
      res.status(400).json({
        message: "Vendor is currently occupied with another project, kindly wait or try another vendor",
      });
      return;
    }

    quote.status = "accepted";
    if (vendor) vendor.is_active = true;

    await saveNotifcation(
      "Your Quote is accepted",
      `Your quote for ${quote.title} has been accepted by ${quote.requester.name}`,
      vendor?._id!,
      "quote",
      quote.id
    );

    await vendor?.save();
    await quote.save();

    res.status(200).json({
      message: "Quote has been accepted successfully!",
      quote,
    });
  } catch (error: any) {
    res.status(500).json({ message: `Unable to accept quote: ${error.message}` });
  }
})
.put("/decline/:id", authentication, async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = (req as any).user;

  try {
    const quote = await Quotes.findById(id);

    if (!quote) {
      res.status(404).json({ message: "Quote not found!" });
      return;
    }

    if (!isRequester(quote, user)) {
      res.status(403).json({ message: "Only the requester can decline this quote" });
      return;
    }

    const vendor = await User.findById(quote.vendor.id);

    if (!quote.amount) {
      res.status(400).json({ message: "You cannot decline quote if not replied" });
      return;
    }

    quote.status = "declined";

    await saveNotifcation(
      "Your Quote is declined",
      `Your quote for ${quote.title} has been declined by ${quote.requester.name}`,
      vendor?._id!,
      "quote",
      quote.id
    );

    await quote.save();

    res.status(200).json({
      message: "Quote has been declined successfully",
      quote,
    });
  } catch (error: any) {
    res.status(500).json({ message: `Unable to decline quote: ${error.message}` });
  }
})
.put("/completetask/:id", authentication, async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = (req as any).user;

  try {
    const quote = await Quotes.findById(id);

    if (!quote) {
      res.status(404).json({ message: "Quote not found!" });
      return;
    }

    if (!isVendor(quote, user)) {
      res.status(403).json({ message: "Only the vendor can mark this quote as completed" });
      return;
    }

    quote.status = "completed";

    await saveNotifcation(
      "Your Quote is completed",
      `Your quote for ${quote.title} has been marked completed by ${quote.vendor.name}`,
      quote.requester?.id!,
      "quote",
      quote.id
    );

    await saveNotifcation(
      "Your Quote is completed",
      `You marked quote ${quote.title} as completed`,
      quote.vendor?.id!,
      "quote",
      quote.id
    );

    await quote.save();

    res.status(200).json({
      message: "Quote has been completed successfully",
      quote,
    });
  } catch (error: any) {
    res.status(500).json({ message: `Unable to complete quote: ${error.message}` });
  }
})
.put("/verify/:id", authentication, async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = (req as any).user;

  try {
    const quote = await Quotes.findById(id);

    if (!quote) {
      res.status(404).json({ message: "Quote not found!" });
      return;
    }

    if (!isRequester(quote, user)) {
      res.status(403).json({ message: "Only the requester can verify this quote" });
      return;
    }

    if (quote.status !== "completed") {
      res.status(400).json({ message: "Quote must be completed before verification" });
      return;
    }

    const vendor = await User.findById(quote.vendor.id);
    quote.status = "verified";

    if (vendor) {
      vendor.is_active = false;
      await vendor.save();
    }

    await saveNotifcation(
      "Quote verified!",
      `Your quote for ${quote.title} has been verified`,
      quote.requester?.id!,
      "quote",
      id
    );

    await saveNotifcation(
      "Quote verified!",
      `Payment for ${quote.title} has been released`,
      quote.vendor?.id!,
      "quote",
      id
    );

    await processTransaction({
      user_id: quote.vendor?.id!,
      type: "deposit",
      amount: parseFloat(quote.amount?.toString()!),
      description: "Payment for verified and completed quote",
      reference: `quote-verify-${id}-vendor`,
    });

    await processTransaction({
      user_id: quote.requester?.id!,
      type: "withdraw",
      amount: parseFloat(quote.amount?.toString()!),
      description: "Payment for verified and completed quote",
      reference: `quote-verify-${id}-requester`,
    });

    await quote.save();

    res.status(200).json({
      message: "Quote has been verified successfully and payment has been made",
      quote,
    });
  } catch (error: any) {
    res.status(500).json({ message: `Unable to verify quote: ${error.message}` });
  }
})
.get("/vendor", authentication, async (req: Request, res: Response) => {
  const user = (req as any).user;

  try {
    const { limit, skip, page } = getPagination(req);

    const [quotes, total] = await Promise.all([
      Quotes.find({ "vendor.id": user._id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Quotes.countDocuments({ "vendor.id": user._id }),
    ]);

    res.status(200).json({
      message: "Success",
      quotes,
      page,
      total,
      pages: Math.ceil(total / limit),
      hasMore: page * limit < total,
    });
  } catch (error: any) {
    res.status(500).json({ message: `Unable to get quotes: ${error.message}` });
  }
})
.get("/:id", authentication, async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const quote = await Quotes.findById(id);

    if (!quote) {
      return res.status(404).json({ message: "Quote not found" });
    }

    const requesterUser = await User.findById(quote.requester.id).select("chat_id name");
    const vendorUser = await User.findById(quote.vendor.id).select("chat_id name");

    const result = {
      ...quote.toObject(),
      requester_chat_id: requesterUser?.chat_id ?? null,
      vendor_chat_id: vendorUser?.chat_id ?? null,
    };

    res.status(200).json({
      message: "Success",
      quote: result,
    });
  } catch (error: any) {
    console.error("Error fetching quote:", error);
    res.status(500).json({ message: `Unable to get quote: ${error.message}` });
  }
})
.post("/", authentication, async (req: Request, res: Response) => {
  const user = (req as any).user;

  try {
    const { vendor_id, title, description } = req.body;
    const vendorUser = await User.findById(vendor_id);

    if (!vendorUser) {
      res.status(400).json({ message: "No vendor selected!" });
      return;
    }

    const quote = await Quotes.create({
      title,
      description,
      requester: {
        id: user._id,
        name: `${user.first_name} ${user.last_name}`,
        picture: user.picture,
      },
      vendor: {
        id: vendorUser._id,
        name: `${vendorUser.first_name} ${vendorUser.last_name}`,
        picture: vendorUser.picture,
      },
    });

    await saveNotifcation(
      `New Quote Request - ${title}`,
      `You have a new quote from ${quote.requester.name} - ${description}`,
      vendorUser._id,
      "quote",
      quote.id
    );

    res.status(200).json({
      quote,
      message: "Success",
    });
  } catch (error: any) {
    res.status(500).json({ message: `Unable to save quote: ${error.message}` });
  }
})
.post("/vendor", authentication, async (req: Request, res: Response) => {
  const user = (req as any).user;

  try {
    const { amount, comment, id } = req.body;
    const quote = await Quotes.findById(id);

    if (!quote) {
      res.status(400).json({ message: "Quote not found" });
      return;
    }

    if (!isVendor(quote, user)) {
      res.status(403).json({ message: "Only the assigned vendor can reply to this quote" });
      return;
    }

    quote.amount = amount;
    quote.vendor_comment = comment;
    quote.status = "replied";

    await saveNotifcation(
      "Your Quote is Replied",
      `Your quote from ${quote.vendor.name} comment: ${comment}, Amount ${amount}`,
      quote.requester.id,
      "quote",
      quote.id
    );

    await quote.save();

    res.status(200).json({
      message: "Quote replied successfully!",
    });
  } catch (error: any) {
    res.status(500).json({ message: `Unable to reply to quote: ${error.message}` });
  }
});

export default quoteRouter;
