import mongoose from "mongoose";

// main().catch(err => console.log(err));
const uri = process.env.MONGODBURL;


const connectionToDatabase = async () => {
    try {
        await mongoose.connect(uri as any)
        .then((res: any) => {
            console.log(`database is connected...`);
        })
        .catch((err: any) => {
            console.log("bd2 error", err);
        })
    } catch (error) {
        console.log("DB Error", error);
    }
}

export default connectionToDatabase;
