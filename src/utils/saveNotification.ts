import Notification from "../schema/notificationScheme";
import { sendPush } from "./sendPush";
import User from "../schema/userSchema";
import mongoose from "mongoose";

export const saveNotifcation = async (
  title: string,
  description: string,
  userId: string | mongoose.Types.ObjectId,
  type?: string,
  quoteid?: string,
  io?: any
) => {
  try {
    const notification = await Notification.create({
      title,
      description,
      user_id: userId,
    });

    const userObjectId = typeof userId === "string" ? new mongoose.Types.ObjectId(userId) : userId;
    const receiver = await User.findOne(userObjectId).select("expo_push_tokens");

    if (receiver?.expo_push_tokens?.length) {
      await sendPush(receiver.expo_push_tokens, title, description, {
        type: type || "notification",
        id: quoteid || ""
      });
    }

    if (io) {
      io.to(userObjectId.toString()).emit("newNotification", notification);
    }

    return { success: true, message: "Notification saved", notification };
  } catch (error) {
    return { success: false, message: error };
  }
};
