import { Request, Response, Router } from "express";
import { authentication } from "../middleware/authentication";
import User from "../schema/userSchema";
import Quotes from "../schema/quoteSchema";
import { getPagination } from "../utils/pagination";
import Notification from "../schema/notificationScheme";
import { saveNotifcation } from "../utils/saveNotification";
import Review from "../schema/reviewSchema";


const reviewRouter = Router();

reviewRouter
.get("/", authentication, async (req: Request, res: Response) => {
    try {
        const { limit, skip, page } = getPagination(req);

        const [reviews, total] = await Promise.all([
            Review.find()
                .skip(skip)
                .limit(limit)
                .populate("user", "first_name last_name picture"), // fetch live user info
            Review.countDocuments(),
        ]);

        res.status(200).json({
            message: "Success",
            reviews,
            page,
            total,
            pages: Math.ceil(total / limit),
        });

    } catch (error: any) {
        res.status(500).json({
            message: `Unable to get reviews: ${error.message}`,
        });
    }
})
.post("/", authentication, async (req: Request, res: Response) => {
    const user = (req as any).user;
    const { vendor_id, review } = req.body;
    
    try {
        const newReview = await Review.create({
            vendor_id,
            review,
            user: user._id
        })

        await newReview.save();

        res.status(200).json({
            message: "Success",
            review: newReview
        });
    } catch (error: any) {
        res.status(500).json({message: `Unable to get reviews: ${error.message}`});
    }  
})
.get("/:id", authentication, async (req: Request, res: Response) => {
    const { id } = req.params;
    
    try {
        const { limit, skip, page } = getPagination(req);

        const [reviews, total] = await Promise.all([
            Review.find({vendor_id: id})
            .skip(skip)
            .limit(limit)
            .populate("user", "first_name last_name picture"), 
            Review.countDocuments({ vendor_id: id }),
        ]);

        res.status(200).json({
            message: "Success",
            reviews,
            page,
            total,
            pages: Math.ceil(total / limit),
        });

        
    } catch (error: any) {
        res.status(500).json({message: `Unable to get vendor reviews: ${error.message}`});
    }  
})

export default reviewRouter;