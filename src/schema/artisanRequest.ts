import { Schema, model } from "mongoose";

interface IArtisanRequest {
    name: string;
    email: string;
    phone: string;
    address: string;
    problem: string;
    title: string;
    createdAt?: Date;
}

const artisanRequestSchema = new Schema<IArtisanRequest>({
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    problem: { type: String, required: true },
    address: { type: String, required: true },
    title: { type: String, required: true },
}, { timestamps: true });

const ArtisanRequest = model<IArtisanRequest>("ArtisanRequest", artisanRequestSchema);

export default ArtisanRequest;
