import { Schema, model, Types } from "mongoose";
import Skill from "./skillsSchema";
// import Skill from "./Skill"; // <-- Make sure this path is correct
interface ICategory {
    title: string;
    description: string;
    image?: string;
    skills: Types.ObjectId[]; // Reference to Skill
}

const categorySchema = new Schema<ICategory>({
    title: { type: String, required: true },
    description: { type: String, required: false, default: "" },
    image: { type: String, required: false, default: "" },
    skills: [{ type: Schema.Types.ObjectId, ref: "skill" }] // <-- ref matches Skill model name
}, { timestamps: true });

const Category = model<ICategory>("Category", categorySchema);
export default Category;
