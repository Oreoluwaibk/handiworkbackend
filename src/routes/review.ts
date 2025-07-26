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
    const user = (req as any).user;
    
    try {
        const { limit, skip, page } = getPagination(req);
        
        const [reviews, total] = await Promise.all([
            Review.find()
            .skip(skip)
            .limit(limit),
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
        res.status(500).json({message: `Unable to get reviews: ${error.message}`});
    }  
})
.post("/", authentication, async (req: Request, res: Response) => {
    const user = (req as any).user;
    const { vendor_id, review } = req.body;
    
    try {
        const newReview = await Review.create({
            vendor_id,
            review,
            user: {
                id: user._id,
                profile_picture: user.picture,
                name: `${user.first_name} ${user.last_name || ""}`
            }
        })

        await newReview.save();

        console.log("ddd");
        

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

        console.log("dhdhd", id);
        
        
        const [reviews, total] = await Promise.all([
            Review.find({vendor_id: id})
            .skip(skip)
            .limit(limit),
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