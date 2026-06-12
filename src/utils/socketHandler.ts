import { Server, Socket } from "socket.io";
import Message from "../schema/messageSchema";
import User from "../schema/userSchema";
import { sendPush } from "./sendPush";
import { verifyToken } from "./tokens";
import { extractToken } from "./extractToken";
import { buildReplySnapshot, sanitizeMentions } from "./chatMessageHelpers";

function getSocketUserId(socket: Socket): string | null {
  const token =
    extractToken(socket.handshake.auth?.token as string) ||
    extractToken(socket.handshake.headers?.authorization as string);

  if (!token) return null;

  const { valid, isVerified } = verifyToken(token);
  if (!valid || !isVerified?.email) return null;

  return isVerified.email;
}

export default function handleSocket(io: Server) {
  io.use(async (socket, next) => {
    const email = getSocketUserId(socket);
    if (!email) {
      return next(new Error("Unauthorized"));
    }

    const user = await User.findOne({ email, is_deleted: false }).select("chat_id email");
    if (!user?.chat_id) {
      return next(new Error("Unauthorized"));
    }

    (socket as any).userEmail = user.email;
    (socket as any).chatId = user.chat_id;
    next();
  });

  io.on("connection", (socket: Socket) => {
    const chatId = (socket as any).chatId as string;
    console.log("✅ New socket connection:", socket.id);

    socket.on("joinRoom", (userId: string) => {
      if (userId !== chatId) {
        socket.emit("error", { message: "Cannot join another user's room" });
        return;
      }

      socket.join(userId);
      console.log(`📥 User ${userId} joined room ${userId}`);
    });

    socket.on("sendMessage", async (data, callback) => {
      try {
        const { sender_id, recipient_id, text, media, reply_to, mentions } = data;

        if (sender_id !== chatId) {
          callback?.({ ok: false, message: "Unauthorized sender" });
          return;
        }

        if (!sender_id || !recipient_id || (!text?.trim() && !media)) {
          callback?.({ ok: false, message: "Invalid message format" });
          return;
        }

        const replySnapshot = await buildReplySnapshot(
          reply_to,
          sender_id,
          recipient_id
        );
        const sanitizedMentions = sanitizeMentions(
          mentions,
          sender_id,
          recipient_id
        );

        const message = await Message.create({
          sender_id,
          recipient_id,
          text: text?.trim() || "",
          media,
          reply_to: replySnapshot,
          mentions: sanitizedMentions,
        });

        const savedMessage = message.toObject();
        console.log("💬 Message saved:", savedMessage._id);

        io.to(recipient_id).emit("receiveMessage", savedMessage);
        socket.emit("messageSent", savedMessage);
        callback?.({ ok: true, message: savedMessage });

        const sender = await User.findOne({ chat_id: sender_id }).select(
          "first_name last_name"
        );
        const receiver = await User.findOne({ chat_id: recipient_id }).select(
          "expo_push_tokens first_name last_name"
        );

        if (receiver?.expo_push_tokens?.length) {
          const senderName = sender
            ? `${sender.first_name} ${sender.last_name}`
            : "Someone";

          const wasMentioned = sanitizedMentions.some(
            (mention) => mention.chat_id === recipient_id
          );
          const pushBody = wasMentioned
            ? `${senderName} mentioned you: ${text || "📎 Sent you a file"}`
            : replySnapshot
              ? `${senderName} replied: ${text || "📎 Sent you a file"}`
              : text || "📎 Sent you a file";

          sendPush(
            receiver.expo_push_tokens,
            senderName,
            pushBody,
            { type: "chat", chatId: sender_id, senderId: sender_id }
          ).catch((pushError) => {
            console.error("Push notification failed:", pushError);
          });
        }
      } catch (error) {
        console.error("❌ Error sending message:", error);
        callback?.({ ok: false, message: "Failed to send message" });
      }
    });

    socket.on("disconnect", () => {
      console.log("🔌 Socket disconnected:", socket.id);
    });
  });
}
