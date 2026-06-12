import { Schema, model } from "mongoose";

export type NotificationType =
  | "notification"
  | "quote"
  | "transaction"
  | "subscription"
  | "chat";

interface INotification {
  title: string;
  description: string;
  user_id: string;
  type: NotificationType;
  is_read: boolean;
  reference_id?: string;
}

const notificationSchema = new Schema<INotification>(
  {
    title: { required: true, type: String },
    description: { required: true, type: String },
    user_id: { required: true, type: String },
    type: {
      type: String,
      enum: ["notification", "quote", "transaction", "subscription", "chat"],
      default: "notification",
    },
    is_read: { type: Boolean, default: false },
    reference_id: { type: String, default: "" },
  },
  { timestamps: true }
);

export { notificationSchema };
const Notification = model<INotification>("notification", notificationSchema);
export default Notification;
