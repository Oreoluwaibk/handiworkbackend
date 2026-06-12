import Notification, { NotificationType } from "../schema/notificationScheme";
import { sendPush } from "./sendPush";
import User from "../schema/userSchema";
import mongoose from "mongoose";
import { getSocketIo } from "./socketIo";

function buildPushData(type: NotificationType, referenceId?: string) {
  switch (type) {
    case "quote":
      return { type: "quote", id: referenceId || "" };
    case "transaction":
      return { type: "transaction", id: referenceId || "" };
    case "subscription":
      return { type: "subscription", id: referenceId || "" };
    case "chat":
      return { type: "chat", chatId: referenceId || "", senderId: referenceId || "" };
    default:
      return { type: "notification", id: referenceId || "" };
  }
}

export const saveNotifcation = async (
  title: string,
  description: string,
  userId: string | mongoose.Types.ObjectId,
  type: NotificationType = "notification",
  referenceId?: string
) => {
  try {
    const userObjectId =
      typeof userId === "string" ? new mongoose.Types.ObjectId(userId) : userId;

    const notification = await Notification.create({
      title,
      description,
      user_id: userObjectId.toString(),
      type,
      is_read: false,
      reference_id: referenceId || "",
    });

    const receiver = await User.findById(userObjectId).select(
      "expo_push_tokens chat_id"
    );

    if (receiver?.expo_push_tokens?.length) {
      await sendPush(
        receiver.expo_push_tokens,
        title,
        description,
        buildPushData(type, referenceId)
      );
    }

    const io = getSocketIo();
    if (io && receiver?.chat_id) {
      io.to(receiver.chat_id).emit("newNotification", notification);
    }

    return { success: true, message: "Notification saved", notification };
  } catch (error) {
    return { success: false, message: error };
  }
};
