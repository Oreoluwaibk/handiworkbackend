import { Schema, model } from "mongoose";

export const ARTISAN_REQUEST_STATUSES = [
  "pending",
  "assigned",
  "in_progress",
  "fulfilled",
  "delivered",
  "cancelled",
] as const;

export type ArtisanRequestStatus = (typeof ARTISAN_REQUEST_STATUSES)[number];

interface IArtisanRequest {
    name: string;
    email: string;
    phone: string;
    address: string;
    problem: string;
    title: string;
    skill_id?: string | null;
    area?: string | null;
    user_id?: string | null;
    quote_id?: string | null;
    selected_bid_id?: string | null;
    status: ArtisanRequestStatus;
    admin_notes?: string;
    createdAt?: Date;
}

const artisanRequestSchema = new Schema<IArtisanRequest>({
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    problem: { type: String, required: true },
    address: { type: String, required: true },
    title: { type: String, required: true },
    skill_id: { type: String, required: false, default: null, index: true },
    area: { type: String, required: false, default: null, index: true },
    user_id: { type: String, required: false, default: null },
    quote_id: { type: String, required: false, default: null },
    selected_bid_id: { type: String, required: false, default: null },
    status: {
      type: String,
      enum: ARTISAN_REQUEST_STATUSES,
      default: "pending",
    },
    admin_notes: { type: String, required: false, default: "" },
}, { timestamps: true });

const ArtisanRequest = model<IArtisanRequest>("ArtisanRequest", artisanRequestSchema);

export default ArtisanRequest;
