
import { Schema, model } from "mongoose";

interface INotification {
    title: string;
    description: string;
    user_id: string;
}

const notificationSchema = new Schema<INotification>({
    title: {required: true, type: String},
    description: {required: true, type: String},
    user_id: {required: true, type: String},
}, { timestamps: true })

export { notificationSchema }
const Notification = model<INotification>("notification", notificationSchema);
export default Notification;
