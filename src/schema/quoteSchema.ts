
import { Schema, model } from "mongoose";
import { toPipelineStatus } from "../utils/jobStatus";

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
    artisan_request_id?: string | null;
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
    artisan_request_id: { required: false, type: String, default: null },
}, { timestamps: true })

quoteSchema.virtual("pipeline_status").get(function () {
    return toPipelineStatus(this.status);
});

quoteSchema.set("toJSON", { virtuals: true });
quoteSchema.set("toObject", { virtuals: true });

export { quoteSchema }
const Quotes = model<IQuote>("Quote", quoteSchema);
export default Quotes;
