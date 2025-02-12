
import { Schema, model } from "mongoose";

interface ICategory {
    title: string;
    description: string;
    skills: string[];
    image: string;
}

const categorySchema = new Schema<ICategory>({
    title: {required: true, type: String},
    description: {required: false, type: String},
    skills: {required: true, type: []},
    image: {required: false, type: String, default: ""}
}, { timestamps: true })

export { categorySchema }
const Category = model<ICategory>("category", categorySchema);
export default Category;
