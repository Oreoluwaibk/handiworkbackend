
import { Schema, model } from "mongoose";

interface IQuote {
    title: string;
    description: string;
    vendor_comment: string;
    requester: {
        name: string;
        picture: string;
        id: string;
    };
    vendor: {
        name: string;
        picture: string;
        id: string;
    };
    amount: number | null;
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
    },
    vendor: {
        name: {required: true, type: String},
        picture: {required: false, type: String, default: null},
        id: {required: true, type: String},
    },
    status: {required: false, type: String, default: "pending"},
    amount: {required: false, type: Number, default: null},
}, { timestamps: true })

export { quoteSchema }
const Quotes = model<IQuote>("Quote", quoteSchema);
export default Quotes;
