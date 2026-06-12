import { Router, Request, Response } from "express";
import Message from "../schema/messageSchema";
import { authentication } from "../middleware/authentication";

const messageRouter = Router();
const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 50;

function parsePageSize(value: unknown): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return DEFAULT_PAGE_SIZE;
  }
  return Math.min(parsed, MAX_PAGE_SIZE);
}

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
  const limit = parsePageSize(req.query.limit);
  const before = req.query.before as string | undefined;

  if (chatId !== user1 && chatId !== user2) {
    return res.status(403).json({ message: "You can only view your own conversations" });
  }

  try {
    const conversationFilter = {
      $or: [
        { sender_id: user1, recipient_id: user2 },
        { sender_id: user2, recipient_id: user1 },
      ],
    };

    const query: Record<string, unknown> = { ...conversationFilter };

    if (before) {
      const beforeDate = new Date(before);
      if (!Number.isNaN(beforeDate.getTime())) {
        query.createdAt = { $lt: beforeDate };
      }
    }

    const messages = await Message.find(query)
      .sort({ createdAt: -1 })
      .limit(limit);

    const orderedMessages = [...messages].reverse();

    res.json({
      messages: orderedMessages,
      hasMore: messages.length === limit,
    });
  } catch (error) {
    res.status(500).json({ message: "Error retrieving messages", error });
  }
});

export default messageRouter;
