
import { Schema, model } from "mongoose";

interface IReview {
    // name: string;
    review: string;
    user: {
        name: string;
        profile_picture: string;
        id: string;
    };
    vendor_id: string;
}

const reviewSchema = new Schema<IReview>({
    review: {required: true, type: String},
    user: {
        name: {required: true, type: String},
        profile_picture: {required: false, type: String},
        id: {required: true, type: String},
    },
    vendor_id: {required: true, type: String},
}, { timestamps: true })

export { reviewSchema }
const Review = model<IReview>("review", reviewSchema);
export default Review;
