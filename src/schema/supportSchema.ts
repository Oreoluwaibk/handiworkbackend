
import { Schema, model } from "mongoose";

export const SUPPORT_STATUSES = ["open", "in_progress", "resolved", "closed"] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];

interface ISupport {
    email: string;
    title: string;
    message: string;
    user_id: string | number;
    status: SupportStatus;
    admin_notes?: string;
}

const supportSchema = new Schema<ISupport>({
    email: {required: true, type: String},
    title: {required: true, type: String},
    message: {required: true, type: String},
    user_id: {required: false, type: String},
    status: { type: String, enum: SUPPORT_STATUSES, default: "open" },
    admin_notes: { type: String, required: false, default: "" },
}, { timestamps: true })

export { supportSchema }
const Support = model<ISupport>("support", supportSchema);
export default Support;
