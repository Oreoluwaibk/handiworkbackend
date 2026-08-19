import mongoose from "mongoose";

const connectionToDatabase = async () => {
  const uri = process.env.MONGODBURL;

  if (!uri) {
    console.error("MONGODBURL environment variable is not set");
    process.exit(1);
  }

  try {
    await mongoose.connect(uri, {
      family: 4,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });
    console.log("database is connected...");
  } catch (error) {
    console.error("DB connection error", error);
    process.exit(1);
  }
};

export default connectionToDatabase;
