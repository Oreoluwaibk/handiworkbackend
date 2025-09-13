import { Request, Response, Router } from "express";
import { authentication } from "../middleware/authentication";
import User from "../schema/userSchema";
import Quotes, { IQuote } from "../schema/quoteSchema";
import { getPagination } from "../utils/pagination";
import Notification from "../schema/notificationScheme";
import { saveNotifcation } from "../utils/saveNotification";
import { processTransaction } from "./transactions";
import mongoose from "mongoose";
import Wallet from "../schema/walletSchema";


interface QuoteWithChats extends IQuote {
  requester_chat_id: string | null;
  vendor_chat_id: string | null;
}
interface QuoteWithChats extends Document {
  requester_chat_id: string | null;
  vendor_chat_id: string | null;
}

const quoteRouter = Router();

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

    // Collect unique requester + vendor ids
    const userIds = [
      ...new Set(quotes.flatMap(q => [q.requester.id, q.vendor.id]))
    ];

    // Convert string ids to ObjectId
    const objectIds = userIds.map(id => new mongoose.Types.ObjectId(id));

    // Get chat_ids from Users schema
    const users = await User.find({ _id: { $in: objectIds } }).select("chat_id");
    const userMap = users.reduce((map, u) => {
      map[u._id.toString()] = u.chat_id ?? null;
      return map;
    }, {} as Record<string, string | null>);

    // Merge chat_ids into each quote
    const responseQuotes: any[] = quotes.map(q => ({
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
    
    try {
        const quote = await Quotes.findById(id);

        if(!quote) {
            res.status(404).json({ message: "Quote not found!" });
            return;
        }
        
        const vendor = await User.findById(quote?.vendor.id);
        if(!quote.amount) {
            res.status(400).json({ message: "You cannot accept quote if not replied" });
            return;
        }
        const wallet = await Wallet.findOne({ user_id: quote.requester.id });
        if (!wallet)  {
            res.status(404).json({ message: 'You cannot accept this quote if you have no money in your wallet!' });
            return
        }

        if(parseFloat(wallet.balance.toString()) < parseFloat(quote.amount.toString())) {
            res.status(400).json({ message: 'You cannot accept quote more than your account balance!' });
            return
        }

        quote.status = "accepted";
        if(vendor && vendor.is_active) {
            res.status(400).json({ message: "Vendor is currently occupied with another project, kindly wait or try another vendor" });
            return;
        }
        if(vendor) vendor.is_active = true;

        const notification = await Notification.create({
            title: "Quote Accepted!",
            description: `Your quote price has been accepted by ${quote.requester.name}, Kindly proceed with project`,
            user_id: vendor?._id
        });

        await vendor?.save();
        await quote.save();
        await notification.save();
        
        res.status(200).json({
            message: "Quote has been accepted successfully!",
            quote
        });
        
    } catch (error: any) {
        res.status(500).json({message: `Unable to get accept: ${error.message}`});
    }  
})
.put("/decline/:id", authentication, async (req: Request, res: Response) => {
    const { id } = req.params;
    
    try {
        const quote = await Quotes.findById(id);

        if(!quote) {
            res.status(404).json({ message: "Quote not found!" });
            return;
        }
        
        const vendor = await User.findById(quote?.vendor.id);
        if(!quote.amount) {
            res.status(400).json({ message: "You cannot decline quote if not replied" });
            return;
        }
        quote.status = "declined";

        const notification = await Notification.create({
            title: "Quote Declined!",
            description: `Your quote price has been declined by ${quote.requester.name}`,
            user_id: vendor?._id
        });

        await quote.save();
        await notification.save();
        
        res.status(200).json({
            message: "Quote has been declined successfully",
            quote
        });
        
    } catch (error: any) {
        res.status(500).json({message: `Unable to get accept: ${error.message}`});
    }  
})
.put("/completetask/:id", authentication, async (req: Request, res: Response) => {
    const { id } = req.params;
    
    try {
        const quote = await Quotes.findById(id);

        if(!quote) {
            res.status(404).json({ message: "Quote not found!" });
            return;
        }
        
        quote.status = "completed";
        const notification = await Notification.create({
            title: "Quote completed!",
            description: `Your quote has been marked as completed by ${quote.vendor.name}`,
            user_id: quote.requester?.id
        });

        const notification2 = await Notification.create({
            title: "Quote completed!",
            description: `Your quote has been marked as completed by ${quote.vendor.name}`,
            user_id: quote.vendor?.id
        });

        await quote.save();
        
        await notification.save();
        await notification2.save();
        
        res.status(200).json({
            message: "Quote has been completed successfully",
            quote
        });
        
    } catch (error: any) {
        res.status(500).json({message: `Unable to get complete: ${error.message}`});
    }  
})
.put("/verify/:id", authentication, async (req: Request, res: Response) => {
    const { id } = req.params;
    
    try {
        const quote = await Quotes.findById(id);

        if(!quote) {
            res.status(404).json({ message: "Quote not found!" });
            return;
        }
        
        const vendor = await User.findById(quote?.vendor.id);
        quote.status = "verified";
        
        if(vendor){
            vendor.is_active = false;
            await vendor?.save();
        }

        const notification = await Notification.create({
            title: "Quote verified!",
            description: `Your quote has been marked as verified by ${quote.vendor.name}`,
            user_id: quote.requester?.id
        });

        const notification2 = await Notification.create({
            title: "Quote verified!",
            description: `Your quote has been marked as verified by ${quote.vendor.name}`,
            user_id: quote.vendor?.id
        });

        const transaction = await processTransaction({
            user_id: quote.vendor?.id!,
            type: 'deposit',
            amount: parseFloat(quote?.amount?.toString()!),
            description: "Payment for verified and completed quote",
        });

        await processTransaction({
            user_id: quote.requester?.id!,
            type: 'withdraw',
            amount: parseFloat(quote?.amount?.toString()!),
            description: "Payment for verified and completed quote",
        });

        await quote.save();
        await notification.save();
        await notification2.save();
        
        res.status(200).json({
            message: "Quote has been verified successfully and payment has been made",
            quote
        });
        
    } catch (error: any) {
        res.status(500).json({message: `Unable to get complete: ${error.message}`});
    }  
})
.get("/vendor", authentication, async (req: Request, res: Response) => {
    const user = (req as any).user;

    try {
        const { limit, skip, page } = getPagination(req);

        const [quotes, total] = await Promise.all([
            Quotes.find({"vendor.id": user._id})
            .skip(skip)
            .limit(limit),
            Quotes.countDocuments({"vendor.id": user._id}),
        ]);

        res.status(200).json({
            message: "Success",
            quotes,
            page,
            total,
            pages: Math.ceil(total / limit),
        });
    } catch (error: any) {
        res.status(500).json({message: `Unable to get quotes: ${error.message}`});
    }  
})
.get("/:id", authentication, async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const quote = await Quotes.findById(id);

    if (!quote) {
      return res.status(404).json({ message: "Quote not found" });
    }

    // Fetch both users (requester and vendor)
    const requesterUser = await User.findById(quote.requester.id).select("chat_id name");
    const vendorUser = await User.findById(quote.vendor.id).select("chat_id name");

    // Attach chat_ids (null if not found)
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
.post("/", authentication, async(req: Request, res: Response) => {
    const user = (req as any).user;
    try {
        const { vendor_id, title, description } = req.body;
        const vendorUser = await User.findById(vendor_id);

        if(!vendorUser) {
            res.status(400).json({message: "No vendor selected!"});
            return;
        }

        const quote = await Quotes.create({
            title,
            description,
            // "requester.id": "",
            "requester": {
                id: user._id,
                name: `${user.first_name} ${user.last_name}`,
                picture: user.picture,
            },
            "vendor": {
                id: vendorUser._id,
                name: `${vendorUser.first_name} ${vendorUser.last_name}`,
                picture: vendorUser.picture,
            }
        });

        const response = await saveNotifcation(
            "You have a new quote request",
            `You have a new quote from ${quote.requester.name}`,
            vendorUser?._id
        )
        await quote.save();

        res.status(200).json({
            quote,
            message: "Success"
        })
    } catch (error: any) {
        res.status(500).json({message: `Unable to get save quote: ${error.message}`});
    } 
})
.post("/vendor", authentication, async(req: Request, res: Response) => {
    try {
        const { amount, comment, id } = req.body;
        const quote = await Quotes.findById(id);

        if(!quote) {
            res.status(400).json({message: "Quote not found"});
            return;
        }

        quote.amount = amount;
        quote.vendor_comment = comment;
        quote.status = "replied"

        const response = await saveNotifcation(
            "Your quote has been replied",
            `Your quote from ${quote.vendor.name} has been replied to`,
            quote.requester.id
        )
        await quote.save();

        res.status(200).json({
            message: "Quote replied successfully!"
        })
    } catch (error: any) {
        res.status(500).json({message: `Unable to get reply quote: ${error.message}`});
    } 
})



export default quoteRouter;