import { Router, Request, Response } from "express";
import Message from "../schema/messageSchema";
import mongoose from "mongoose";
import { authentication } from "../middleware/authentication";
// import Message from "../models/messageSchema";

const messageRouter = Router();

// Get chat history between two users
messageRouter
.get("/chats", authentication, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const chatId = user.chat_id;
  
  try {
    const inbox = await Message.aggregate([
      {
        $match: {
          $or: [
            { sender_id: chatId },
            { recipient_id: chatId }
          ]
        }
      },
      { $sort: { createdAt: -1 } },
      {
        $addFields: {
          otherUserChatId: {
            $cond: [
              { $eq: ["$sender_id", chatId] },
              "$recipient_id",
              "$sender_id"
            ]
          }
        }
      },
      {
        $group: {
          _id: "$otherUserChatId",
          lastMessage: { $first: "$$ROOT" }
        }
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "chat_id",
          as: "user"
        }
      },
      { $unwind: "$user" },
      {
        $project: {
          chat_id: "$user.chat_id",
          name: { $concat: ["$user.first_name", " ", "$user.last_name"] },
          email: "$user.email",
          picture: "$user.picture",
          lastMessage: "$lastMessage.text",
          media: "$lastMessage.media",
          timestamp: "$lastMessage.createdAt"
        }
      },
      { $sort: { timestamp: -1 } }
    ]);

    res.status(200).json({ success: true, inbox });
  } catch (err) {
    console.error("Inbox aggregation failed:", err);
    res.status(500).json({ success: false, message: "Failed to fetch inbox" });
  }
})
.get("/:user1/:user2", authentication, async (req: Request, res: Response) => {
  const { user1, user2 } = req.params;
  const user = (req as any).user;
  const chatId = user.chat_id;

  if (chatId !== user1 && chatId !== user2) {
    return res.status(403).json({ message: "You can only view your own conversations" });
  }

  try {
    const messages = await Message.find({
      $or: [
        { sender_id: user1, recipient_id: user2 },
        { sender_id: user2, recipient_id: user1 },
      ],
    }).sort({ createdAt: 1 });

    res.json(messages);
  } catch (error) {
    res.status(500).json({ message: "Error retrieving messages", error });
  }
});

export default messageRouter;
