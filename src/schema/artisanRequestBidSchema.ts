import { Schema, model } from "mongoose";

export const ARTISAN_BID_STATUSES = ["pending", "selected", "rejected"] as const;
export type ArtisanBidStatus = (typeof ARTISAN_BID_STATUSES)[number];

export interface IArtisanRequestBid {
  artisan_request_id: string;
  vendor_id: string;
  vendor: {
    name: string;
    picture?: string | null;
    id: string;
  };
  amount: number;
  comment?: string;
  status: ArtisanBidStatus;
}

const artisanRequestBidSchema = new Schema<IArtisanRequestBid>(
  {
    artisan_request_id: { type: String, required: true, index: true },
    vendor_id: { type: String, required: true, index: true },
    vendor: {
      name: { type: String, required: true },
      picture: { type: String, default: null },
      id: { type: String, required: true },
    },
    amount: { type: Number, required: true },
    comment: { type: String, default: "" },
    status: {
      type: String,
      enum: ARTISAN_BID_STATUSES,
      default: "pending",
    },
  },
  { timestamps: true }
);

artisanRequestBidSchema.index(
  { artisan_request_id: 1, vendor_id: 1 },
  { unique: true }
);

const ArtisanRequestBid = model<IArtisanRequestBid>(
  "ArtisanRequestBid",
  artisanRequestBidSchema
);

export default ArtisanRequestBid;
