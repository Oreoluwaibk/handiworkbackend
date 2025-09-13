
import { Schema, model } from "mongoose";

export interface IQuote {
    title: string;
    description: string;
    vendor_comment: string;
    requester: {
        name: string;
        picture: string;
        id: string;
        chat_id: string;
    };
    vendor: {
        name: string;
        picture: string;
        id: string;
        chat_id: string;
    };
    amount: number;
    status: string;
}

const quoteSchema = new Schema<IQuote>({
    title: {required: true, type: String},
    description: {required: true, type: String},
    vendor_comment: {required: false, type: String, default: null},
    requester: {
        name: {required: true, type: String},
        picture: {required: false, type: String, default: null},
        id: {required: true, type: String},
        chat_id: {required: false, type: String},
    },
    vendor: {
        name: {required: true, type: String},
        picture: {required: false, type: String, default: null},
        id: {required: true, type: String},
        chat_id: {required: false, type: String},

    },
    status: {required: false, type: String, default: "pending"},
    amount: {required: false, type: Number, default: 0},
}, { timestamps: true })

export { quoteSchema }
const Quotes = model<IQuote>("Quote", quoteSchema);
export default Quotes;
