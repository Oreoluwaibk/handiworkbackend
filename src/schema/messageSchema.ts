import { Schema, model, Document } from "mongoose";

export interface IMessage extends Document {
  sender_id: string;
  recipient_id: string;
  text?: string;
  media?: {
    type: "image" | "video" | "audio";
    url: string;
  };
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
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const Message = model<IMessage>("Message", messageSchema);
export default Message;
