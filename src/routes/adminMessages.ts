import { Router, Request, Response } from "express";
import Message from "../schema/messageSchema";
import User from "../schema/userSchema";
import { getSupportChatId, getSupportChatUser } from "../utils/supportChat";
import { getSocketIo } from "../utils/socketIo";
import { sendPush } from "../utils/sendPush";
import { buildReplySnapshot, sanitizeMentions } from "../utils/chatMessageHelpers";
import { writeAuditLog } from "../utils/auditLog";

const adminMessagesRouter = Router();
const DEFAULT_PAGE_SIZE = 40;
const MAX_PAGE_SIZE = 80;

function parsePageSize(value: unknown, fallback = DEFAULT_PAGE_SIZE): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (Number.isNaN(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, MAX_PAGE_SIZE);
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

adminMessagesRouter.get("/messages/identity", async (_req: Request, res: Response) => {
  try {
    const support = await getSupportChatUser();
    return res.status(200).json({
      message: "Success",
      support: {
        chat_id: support.chat_id,
        name: `${support.first_name} ${support.last_name}`.trim(),
        email: support.email,
        picture: support.picture || null,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
});

adminMessagesRouter.get("/messages/inbox", async (req: Request, res: Response) => {
  try {
    const supportChatId = await getSupportChatId();
    const search = String(req.query.search || "").trim();

    const inbox = await Message.aggregate([
      {
        $match: {
          $or: [{ sender_id: supportChatId }, { recipient_id: supportChatId }],
        },
      },
      { $sort: { createdAt: -1 } },
      {
        $addFields: {
          otherUserChatId: {
            $cond: [
              { $eq: ["$sender_id", supportChatId] },
              "$recipient_id",
              "$sender_id",
            ],
          },
        },
      },
      {
        $group: {
          _id: "$otherUserChatId",
          lastMessage: { $first: "$$ROOT" },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "chat_id",
          as: "user",
        },
      },
      { $unwind: "$user" },
      {
        $project: {
          chat_id: "$user.chat_id",
          user_id: "$user._id",
          name: {
            $trim: {
              input: {
                $concat: [
                  { $ifNull: ["$user.first_name", ""] },
                  " ",
                  { $ifNull: ["$user.last_name", ""] },
                ],
              },
            },
          },
          email: "$user.email",
          picture: "$user.picture",
          is_vendor: "$user.is_vendor",
          lastMessage: "$lastMessage.text",
          media: "$lastMessage.media",
          last_sender_id: "$lastMessage.sender_id",
          timestamp: "$lastMessage.createdAt",
        },
      },
      ...(search
        ? [
            {
              $match: {
                $or: [
                  { name: { $regex: escapeRegex(search), $options: "i" } },
                  { email: { $regex: escapeRegex(search), $options: "i" } },
                ],
              },
            },
          ]
        : []),
      { $sort: { timestamp: -1 } },
    ]);

    return res.status(200).json({
      message: "Success",
      support_chat_id: supportChatId,
      total: inbox.length,
      inbox,
    });
  } catch (error: any) {
    console.error("Admin inbox failed:", error);
    return res.status(500).json({ message: error.message || "Failed to fetch inbox" });
  }
});

adminMessagesRouter.get("/messages/users", async (req: Request, res: Response) => {
  try {
    const supportChatId = await getSupportChatId();
    const search = String(req.query.search || "").trim();
    const limit = parsePageSize(req.query.limit, 20);

    if (search.length < 2) {
      return res.status(200).json({ message: "Success", users: [] });
    }

    const regex = new RegExp(escapeRegex(search), "i");
    const users = await User.find({
      chat_id: { $exists: true, $nin: [null, "", supportChatId] },
      is_deleted: false,
      is_admin: { $ne: true },
      email: { $not: /@quikwrk\.system$/i },
      $or: [
        { first_name: regex },
        { last_name: regex },
        { email: regex },
        { phone_number: regex },
      ],
    })
      .select("first_name last_name email picture chat_id is_vendor phone_number")
      .limit(limit)
      .sort({ first_name: 1 });

    return res.status(200).json({
      message: "Success",
      users: users.map((user) => ({
        _id: user._id,
        chat_id: user.chat_id,
        name: `${user.first_name || ""} ${user.last_name || ""}`.trim(),
        email: user.email,
        picture: user.picture,
        is_vendor: user.is_vendor,
        phone_number: user.phone_number,
      })),
    });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
});

adminMessagesRouter.get("/messages/:userChatId", async (req: Request, res: Response) => {
  try {
    const supportChatId = await getSupportChatId();
    const userChatId = String(req.params.userChatId || "").trim();
    const limit = parsePageSize(req.query.limit);
    const before = req.query.before as string | undefined;

    if (!userChatId || userChatId === supportChatId) {
      return res.status(400).json({ message: "Invalid chat user" });
    }

    const peer = await User.findOne({ chat_id: userChatId }).select(
      "first_name last_name email picture chat_id is_vendor phone_number is_deleted"
    );

    if (!peer) {
      return res.status(404).json({ message: "User not found for this chat" });
    }

    const conversationFilter = {
      $or: [
        { sender_id: supportChatId, recipient_id: userChatId },
        { sender_id: userChatId, recipient_id: supportChatId },
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

    return res.status(200).json({
      message: "Success",
      support_chat_id: supportChatId,
      peer: {
        chat_id: peer.chat_id,
        name: `${peer.first_name || ""} ${peer.last_name || ""}`.trim(),
        email: peer.email,
        picture: peer.picture,
        is_vendor: peer.is_vendor,
        phone_number: peer.phone_number,
      },
      messages: [...messages].reverse(),
      hasMore: messages.length === limit,
    });
  } catch (error: any) {
    return res.status(500).json({ message: error.message || "Error retrieving messages" });
  }
});

adminMessagesRouter.post("/messages", async (req: Request, res: Response) => {
  try {
    const admin = (req as any).user;
    if (!admin?._id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const supportChatId = await getSupportChatId();
    const {
      recipient_chat_id,
      text,
      media,
      reply_to,
      mentions,
    } = req.body || {};

    const recipientChatId = String(recipient_chat_id || "").trim();
    const messageText = typeof text === "string" ? text.trim() : "";

    if (!recipientChatId) {
      return res.status(400).json({ message: "recipient_chat_id is required" });
    }

    if (recipientChatId === supportChatId) {
      return res.status(400).json({ message: "Cannot message the support account" });
    }

    if (!messageText && !media) {
      return res.status(400).json({ message: "Message text or media is required" });
    }

    const recipient = await User.findOne({
      chat_id: recipientChatId,
      is_deleted: false,
    }).select("chat_id first_name last_name expo_push_tokens email");

    if (!recipient) {
      return res.status(404).json({ message: "Recipient not found" });
    }

    const replySnapshot = await buildReplySnapshot(
      reply_to,
      supportChatId,
      recipientChatId
    );
    const sanitizedMentions = sanitizeMentions(
      mentions,
      supportChatId,
      recipientChatId
    );

    const message = await Message.create({
      sender_id: supportChatId,
      recipient_id: recipientChatId,
      text: messageText,
      media,
      reply_to: replySnapshot,
      mentions: sanitizedMentions,
    });

    const savedMessage = message.toObject();
    const io = getSocketIo();
    io?.to(recipientChatId).emit("receiveMessage", savedMessage);

    if (recipient.expo_push_tokens?.length) {
      const pushBody = messageText || "📎 Sent you a file";
      sendPush(recipient.expo_push_tokens, "QuikWrk Support", pushBody, {
        type: "chat",
        chatId: supportChatId,
        senderId: supportChatId,
      }).catch((pushError) => {
        console.error("Admin chat push failed:", pushError);
      });
    }

    await writeAuditLog({
      action: "support_chat_message_sent",
      adminId: admin._id.toString(),
      targetUserId: recipient._id?.toString?.(),
      details: {
        recipient_chat_id: recipientChatId,
        recipient_email: recipient.email,
        message_id: String(savedMessage._id),
        has_media: Boolean(media),
      },
    });

    return res.status(201).json({
      message: "Message sent",
      support_chat_id: supportChatId,
      data: savedMessage,
    });
  } catch (error: any) {
    console.error("Admin send message failed:", error);
    return res.status(500).json({ message: error.message || "Failed to send message" });
  }
});

export default adminMessagesRouter;
