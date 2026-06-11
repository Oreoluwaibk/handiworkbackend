import { Schema, model, Types } from "mongoose";

interface ISkill {
    title: string;
    description?: string;
    category: Types.ObjectId; // reference to Category
}

const skillSchema = new Schema<ISkill>({
    title: { type: String, required: true },
    description: { type: String, default: "" },
    category: { type: Schema.Types.ObjectId, ref: "Category", required: true },
}, { timestamps: true });

// Optional: auto-increment numeric id (requires mongoose-sequence)
// Otherwise, ObjectId is used as unique identifier

const Skill = model<ISkill>("skill", skillSchema);
export default Skill;
