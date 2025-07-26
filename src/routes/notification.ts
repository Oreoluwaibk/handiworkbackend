import { Request, Response, Router } from "express";
import Notification from "../schema/notificationScheme";
import { authentication } from "../middleware/authentication";


const notificationRouter = Router();

notificationRouter
.get("/", authentication, async (req: Request, res: Response) => {
    const user = (req as any).user;
    try {
        const allNotification = await Notification.find({ user_id: user._id });

        res.status(200).json({
            notifications: allNotification,
            message: "success"
       })
    } catch (error) {
        res.status(500).json({
            success: false,
            message: `unable to get all notifications, ${error}`
        })
    }
})
.get("/:id", async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        const notification = await Notification.findById({ _id: id });
        if(!notification) res.status(404).json({
            message: "No notification with this id exist"
        })
        else {
            res.status(200).json({
                notification,
                message: "success"
            })
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            message: `unable to get skiill, ${error}`
        })
    }
})
.get("/:user_id", async (req: Request, res: Response) => {
    const { user_id } = req.params;
    try {
        const notification = await Notification.findById({ user_id });
        if(!notification) res.status(404).json({
            message: "No notification for this user yet"
        })
        else {
            res.status(200).json({
                notification,
                message: "success"
            })
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            message: `unable to get notifications, ${error}`
        })
    }
})
.post("/", async(req: Request, res: Response) => {
    const notification = await Notification.create({
        ...req.body
    })

    await notification.save();

    res.status(200).json({
        message: "success"
    })
    
})
.put("/:id", async(req: Request, res: Response) => {
    const { id } = req.params;
    try {
        const notification = await Notification.findById({ _id: id });
        if(!notification) res.status(404).json({
            message: "No notification with this id exist"
        })
        else {
            await notification.updateOne({
                ...req.body
            });
            await notification.save();
            res.status(200).json({
                message: "success",
                notification
            })
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            message: `unable to edit this notification, ${error}`
        })
    }
})
.delete("/:id", async(req: Request, res: Response) => {
    const { id } = req.params;
    try {
        const notification = await Notification.findById({ _id: id });
        if(!notification) res.status(404).json({
            message: "No notification with this id exist"
        })
        else {
            await notification.deleteOne();
            res.status(200).json({
                message: "success"
            })
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            message: `unable to delete this notification, ${error}`
        })
    }
})

export default notificationRouter;