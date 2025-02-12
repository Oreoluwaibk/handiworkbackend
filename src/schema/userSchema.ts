
import { Schema, model } from "mongoose";

interface IUser {
    first_name: string;
    last_name: string;
    phone_number: number;
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
    is_verified: boolean;
    resetToken: string;
    otp?: number| null;
    bio?: string;
}

const userSchema = new Schema<IUser>({
    first_name: {required: true, type: String},
    last_name: {required: true, type: String},
    phone_number: {required: false, type: Number},
    picture: {required: false, type: String},
    bio: {required: false, type: String},
    password: {required: true, type: String},
    resetToken: {required: false, type: String},
    otp: {required: false, type: Number},
    address: {required: false, type: String},
    area: {required: false, type: String},
    postal_code: {required: false, type: String},
    state: {required: false, type: String},
    country: {required: false, type: String},
    email: {required: true, type: String},
    skill: {required: false, type: Array},
    is_vendor: {required: true, type: Boolean, default: false},
    is_verified: {required: false, type: Boolean, default: false}
}, { timestamps: true })

export { userSchema }
const User = model<IUser>("user", userSchema);
export default User;
