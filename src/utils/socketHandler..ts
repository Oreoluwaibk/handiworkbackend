import { Server, Socket } from "socket.io";
import Message from "../schema/messageSchema";
import User from "../schema/userSchema";
import { sendPush } from "./sendPush";

export default function handleSocket(io: Server) {
  io.on("connection", (socket: Socket) => {
    console.log("✅ New socket connection:", socket.id);

    socket.on("joinRoom", (userId: string) => {
      socket.join(userId);
      console.log(`📥 User ${userId} joined room ${userId}`);
    });

    socket.on("sendMessage", async (data) => {
      try {
        const { sender_id, recipient_id, text, media } = data;

        if (!sender_id || !recipient_id || (!text && !media)) {
          socket.emit("error", { message: "Invalid message format" });
          return;
        }

        const message = await Message.create({ sender_id, recipient_id, text, media });

        io.to(recipient_id).emit("receiveMessage", message);
        socket.emit("messageSent", message);

        const receiver = await User.findOne({ chat_id: recipient_id }).select(
          "expo_push_tokens first_name last_name"
        );
        
        if (receiver?.expo_push_tokens?.length) {
          await sendPush(
            receiver.expo_push_tokens,
            `${receiver.first_name} ${receiver.last_name}`,
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
