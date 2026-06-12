import Message, { IMessageMention, IMessageReply } from "../schema/messageSchema";
import User from "../schema/userSchema";

export async function buildReplySnapshot(
  replyTo: Partial<IMessageReply> | undefined,
  senderId: string,
  recipientId: string
): Promise<IMessageReply | undefined> {
  if (!replyTo?.message_id) {
    return undefined;
  }

  const original = await Message.findById(replyTo.message_id);
  if (!original) {
    return undefined;
  }

  const isParticipant =
    [original.sender_id, original.recipient_id].includes(senderId) &&
    [original.sender_id, original.recipient_id].includes(recipientId);

  if (!isParticipant) {
    return undefined;
  }

  if (replyTo.sender_name && replyTo.sender_id) {
    return {
      message_id: original._id.toString(),
      text: replyTo.text ?? original.text,
      sender_id: replyTo.sender_id,
      sender_name: replyTo.sender_name,
      media_type: replyTo.media_type ?? original.media?.type,
    };
  }

  const replySender = await User.findOne({ chat_id: original.sender_id }).select(
    "first_name last_name"
  );

  return {
    message_id: original._id.toString(),
    text: original.text,
    sender_id: original.sender_id,
    sender_name: replySender
      ? `${replySender.first_name} ${replySender.last_name}`.trim()
      : "User",
    media_type: original.media?.type,
  };
}

export function sanitizeMentions(
  mentions: IMessageMention[] | undefined,
  senderId: string,
  recipientId: string
): IMessageMention[] {
  if (!Array.isArray(mentions)) {
    return [];
  }

  const allowedIds = new Set([senderId, recipientId]);

  return mentions
    .filter(
      (mention) =>
        mention?.chat_id &&
        mention?.name &&
        allowedIds.has(mention.chat_id)
    )
    .map((mention) => ({
      chat_id: mention.chat_id,
      name: mention.name.trim(),
    }));
}
