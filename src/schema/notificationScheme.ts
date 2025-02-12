
import { Schema, model } from "mongoose";

interface INotification {
    title: string;
    notification: string;
    user: {
        name: string;
        profile_picture: string;
        id: string;
    };
    user_id: string;
}

const notificationSchema = new Schema<INotification>({
    title: {required: true, type: String},
    notification: {required: true, type: String},
    user: {
        name: {required: true, type: String},
        profile_picture: {required: true, type: String},
        id: {required: true, type: String},
    },
    user_id: {required: false, type: String},
}, { timestamps: true })

export { notificationSchema }
const Notification = model<INotification>("notification", notificationSchema);
export default Notification;
