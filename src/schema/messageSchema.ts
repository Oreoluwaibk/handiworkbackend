import { Schema, model, Document } from "mongoose";

export interface IMessageMention {
  chat_id: string;
  name: string;
}

export interface IMessageReply {
  message_id: string;
  text?: string;
  sender_id: string;
  sender_name?: string;
  media_type?: "image" | "video" | "audio";
}

export interface IMessage extends Document {
  sender_id: string;
  recipient_id: string;
  text?: string;
  media?: {
    type: "image" | "video" | "audio";
    url: string;
  };
  reply_to?: IMessageReply;
  mentions?: IMessageMention[];
  timestamp: Date;
}

const messageSchema = new Schema<IMessage>(
  {
    sender_id: { type: String, required: true },
    recipient_id: { type: String, required: true },
    text: { type: String },
    media: {
      type: {
        type: String,
        enum: ["image", "video", "audio"],
      },
      url: String,
    },
    reply_to: {
      message_id: { type: String },
      text: { type: String },
      sender_id: { type: String },
      sender_name: { type: String },
      media_type: { type: String, enum: ["image", "video", "audio"] },
    },
    mentions: [
      {
        chat_id: { type: String },
        name: { type: String },
      },
    ],
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const Message = model<IMessage>("Message", messageSchema);
export default Message;
