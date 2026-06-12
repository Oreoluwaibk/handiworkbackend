import { Request, Response, Router } from "express";
import Notification from "../schema/notificationScheme";
import { authentication } from "../middleware/authentication";
import { getPagination } from "../utils/pagination";

const notificationRouter = Router();

notificationRouter
.get("/unread-count", authentication, async (req: Request, res: Response) => {
  const user = (req as any).user;

  try {
    const count = await Notification.countDocuments({
      user_id: user._id.toString(),
      is_read: false,
    });

    res.status(200).json({
      count,
      message: "success",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: `unable to get unread count, ${error}`,
    });
  }
})
.patch("/read-all", authentication, async (req: Request, res: Response) => {
  const user = (req as any).user;

  try {
    await Notification.updateMany(
      { user_id: user._id.toString(), is_read: false },
      { $set: { is_read: true } }
    );

    res.status(200).json({ message: "success" });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: `unable to mark notifications as read, ${error}`,
    });
  }
})
.get("/", authentication, async (req: Request, res: Response) => {
  const user = (req as any).user;

  try {
    const { limit, skip, page } = getPagination(req);
    const userId = user._id.toString();

    const [notifications, total] = await Promise.all([
      Notification.find({ user_id: userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Notification.countDocuments({ user_id: userId }),
    ]);

    res.status(200).json({
      notifications,
      page,
      total,
      pages: Math.ceil(total / limit),
      hasMore: page * limit < total,
      message: "success",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: `unable to get all notifications, ${error}`,
    });
  }
})
.get("/by-user/:user_id", authentication, async (req: Request, res: Response) => {
  const { user_id } = req.params;
  const user = (req as any).user;

  if (user._id.toString() !== user_id) {
    return res.status(403).json({ message: "You can only view your own notifications" });
  }

  try {
    const notifications = await Notification.find({ user_id });

    res.status(200).json({
      notifications,
      message: "success",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: `unable to get notifications, ${error}`,
    });
  }
})
.get("/:id", authentication, async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = (req as any).user;

  try {
    const notification = await Notification.findById(id);

    if (!notification) {
      return res.status(404).json({
        message: "No notification with this id exist",
      });
    }

    if (notification.user_id?.toString() !== user._id.toString()) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    res.status(200).json({
      notification,
      message: "success",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: `unable to get notification, ${error}`,
    });
  }
})
.post("/", authentication, async (req: Request, res: Response) => {
  const user = (req as any).user;

  const notification = await Notification.create({
    ...req.body,
    user_id: req.body.user_id || user._id,
  });

  res.status(200).json({
    message: "success",
    notification,
  });
})
.patch("/:id/read", authentication, async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = (req as any).user;

  try {
    const notification = await Notification.findById(id);

    if (!notification) {
      return res.status(404).json({
        message: "No notification with this id exist",
      });
    }

    if (notification.user_id?.toString() !== user._id.toString()) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    notification.is_read = true;
    await notification.save();

    res.status(200).json({
      message: "success",
      notification,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: `unable to mark notification as read, ${error}`,
    });
  }
})
.put("/:id", authentication, async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = (req as any).user;

  try {
    const notification = await Notification.findById(id);

    if (!notification) {
      return res.status(404).json({
        message: "No notification with this id exist",
      });
    }

    if (notification.user_id?.toString() !== user._id.toString()) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    Object.assign(notification, req.body);
    await notification.save();

    res.status(200).json({
      message: "success",
      notification,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: `unable to edit this notification, ${error}`,
    });
  }
})
.delete("/:id", authentication, async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = (req as any).user;

  try {
    const notification = await Notification.findById(id);

    if (!notification) {
      return res.status(404).json({
        message: "No notification with this id exist",
      });
    }

    if (notification.user_id?.toString() !== user._id.toString()) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    await notification.deleteOne();

    res.status(200).json({
      message: "success",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: `unable to delete this notification, ${error}`,
    });
  }
});

export default notificationRouter;
