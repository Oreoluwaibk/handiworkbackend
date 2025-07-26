
import { Schema, model } from "mongoose";

interface IUser {
    first_name: string;
    last_name: string;
    phone_number: string;
    password: string;
    picture?: string;
    address: string;
    address_line2?: string;
    postal_code?: any;
    state: string;
    country: string;
    email: string;
    skill?: string[];
    area: string;
    is_vendor: boolean;
    is_recommended?: boolean;
    is_verified: boolean;
    is_active: boolean;
    resetToken: string;
    otp?: number| null;
    bio?: string;
    nin?: string;
    chat_id?: string; 
}

const userSchema = new Schema<IUser>({
    first_name: {required: true, type: String},
    last_name: {required: true, type: String},
    phone_number: {required: false, type: String},
    picture: {required: false, type: String, default: null},
    bio: {required: false, type: String, default: ""},
    password: {required: true, type: String},
    resetToken: {required: false, type: String},
    otp: {required: false, type: Number},
    address: {required: false, type: String, default: null},
    area: {required: false, type: String},
    postal_code: {required: false, type: String},
    state: {required: false, type: String},
    country: {required: false, type: String},
    email: {required: true, type: String},
    skill: {required: false, type: Array, default: []},
    is_vendor: {required: true, type: Boolean, default: false},
    is_recommended: {required: false, type: Boolean, default: false},
    is_verified: {required: false, type: Boolean, default: false},
    is_active: {required: false, type: Boolean, default: false},
    nin: {required: false, type: String, default: null},
    chat_id: { type: String, required: false, default: null },
}, { timestamps: true })

export { userSchema }
const User = model<IUser>("user", userSchema);
export default User;
