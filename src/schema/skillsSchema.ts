
import { Schema, model } from "mongoose";

interface ISkill {
    id: number;
    description: string;
    title: string;
}

const skillSchema = new Schema<ISkill>({
    id: {required: true, type: Number},
    description: {required: false, type: String, default: ""},
    title: {required: true, type: String}
}, { timestamps: true })

export { skillSchema }
const Skill = model<ISkill>("skill", skillSchema);
export default Skill;
