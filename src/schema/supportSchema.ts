
import { Schema, model } from "mongoose";

interface ISupport {
    email: string;
    title: string;
    message: string;
    user_id: string | number;
}

const supportSchema = new Schema<ISupport>({
    email: {required: true, type: String},
    title: {required: true, type: String},
    message: {required: true, type: String},
    user_id: {required: false, type: String},
}, { timestamps: true })

export { supportSchema }
const Support = model<ISupport>("support", supportSchema);
export default Support;
