import { Server, Socket } from "socket.io";
import Message from "../schema/messageSchema";

export default function handleSocket(io: Server) {
  io.on("connection", (socket: Socket) => {
    console.log("✅ New socket connection:", socket.id);

    socket.on("sendMessage", async (data) => {
      try {
        const {
          sender_id,
          recipient_id,
          text,
          media // optional: { type: 'image' | 'video' | 'audio', url: string }
        } = data;

        if (!sender_id || !recipient_id || (!text && !media)) {
          socket.emit("error", { message: "Invalid message format" });
          return;
        }

        const message = await Message.create({
          sender_id,
          recipient_id,
          text,
          media,
        });

        // Emit message to recipient
        io.to(recipient_id).emit("receiveMessage", message);

        // Optionally emit to sender for confirmation
        socket.emit("messageSent", message);
      } catch (error) {
        console.error("❌ Error sending message:", error);
        socket.emit("error", { message: "Failed to send message" });
      }
    });

    socket.on("joinRoom", (userId) => {
      socket.join(userId); // Now we can use io.to(userId).emit()
      console.log(`📥 User ${userId} joined their room`);
    });

    socket.on("disconnect", () => {
      console.log("🔌 Socket disconnected:", socket.id);
    });
  });
}
