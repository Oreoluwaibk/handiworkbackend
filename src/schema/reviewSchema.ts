import { Schema, model, Types } from "mongoose";

interface IReview {
  review: string;
  user: Types.ObjectId;   // Reference to User model
  vendor_id: string;
}

const reviewSchema = new Schema<IReview>(
  {
    review: { type: String, required: true },
    user: { type: Schema.Types.ObjectId, ref: "user", required: true },
    vendor_id: { type: String, required: true },
  },
  { timestamps: true }
);
// const reviewSchema = new Schema<IReview>({
//     review: {required: true, type: String},
//     user: {
//         name: {required: true, type: String},
//         profile_picture: {required: false, type: String},
//         id: {required: true, type: String},
//     },
//     vendor_id: {required: true, type: String},
// }, { timestamps: true })

export { reviewSchema }
const Review = model<IReview>("review", reviewSchema);
export default Review;
