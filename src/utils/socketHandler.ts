import { Server, Socket } from "socket.io";
import Message from "../schema/messageSchema";
import User from "../schema/userSchema";
import { sendPush } from "./sendPush";
import { verifyToken } from "./tokens";
import { extractToken } from "./extractToken";

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

    socket.on("sendMessage", async (data) => {
      try {
        const { sender_id, recipient_id, text, media } = data;

        if (sender_id !== chatId) {
          socket.emit("error", { message: "Unauthorized sender" });
          return;
        }

        if (!sender_id || !recipient_id || (!text && !media)) {
          socket.emit("error", { message: "Invalid message format" });
          return;
        }

        const message = await Message.create({ sender_id, recipient_id, text, media });

        io.to(recipient_id).emit("receiveMessage", message);
        socket.emit("messageSent", message);

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

          await sendPush(
            receiver.expo_push_tokens,
            senderName,
            text || "📎 Sent you a file",
            { type: "chat", chatId: sender_id, senderId: sender_id }
          );
        }
      } catch (error) {
        console.error("❌ Error sending message:", error);
        socket.emit("error", { message: "Failed to send message" });
      }
    });

    socket.on("disconnect", () => {
      console.log("🔌 Socket disconnected:", socket.id);
    });
  });
}
