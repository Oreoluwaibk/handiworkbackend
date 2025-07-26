import { Request, Response, Router } from "express";
import { authentication } from "../middleware/authentication";
import User from "../schema/userSchema";
import Quotes from "../schema/quoteSchema";
import { getPagination } from "../utils/pagination";
import Notification from "../schema/notificationScheme";
import { saveNotifcation } from "../utils/saveNotification";


const quoteRouter = Router();

quoteRouter
.get("/", authentication, async (req: Request, res: Response) => {
    const user = (req as any).user;
    const { status } = req.query;
    
    try {
        const { limit, skip, page } = getPagination(req);
        if(status) {
            const [quotes, total] = await Promise.all([
                Quotes.find({"requester.id": user._id, status})
                .skip(skip)
                .limit(limit),
                Quotes.countDocuments({"requester.id": user._id, status}),
            ]);

            res.status(200).json({
                message: "Success",
                quotes,
                page,
                total,
                pages: Math.ceil(total / limit),
            });

            return;
        }
        const [quotes, total] = await Promise.all([
            Quotes.find({"requester.id": user._id})
            .skip(skip)
            .limit(limit),
            Quotes.countDocuments({"requester.id": user._id}),
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

        res.status(200).json({
            message: "Success",
            quote
        });
        
    } catch (error: any) {
        console.log("erer", error);
        
        res.status(500).json({message: `Unable to get quote: ${error.message}`});
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
        console.log("res", response);
        

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
        console.log("res", response);
        await quote.save();

        res.status(200).json({
            message: "Quote replied successfully!"
        })
    } catch (error: any) {
        res.status(500).json({message: `Unable to get reply quote: ${error.message}`});
    } 
})



export default quoteRouter;