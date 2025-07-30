import { Router, Request, Response } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import cloudinary from "../utils/cloudinary";
// import cloudinary from '../config/cloudinary';

const uploadRouter = Router();

// ✅ Ensure uploads/messages directory exists
const uploadDir = path.join(__dirname, "..", "uploads", "messages");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

export const uploadImage = async (req: Request, res: Response) => {
  try {
    const filePath = req.file!.path;

    const result = await cloudinary.uploader.upload(filePath, {
      folder: 'handiwork_uploads'
    });

    // Optional: Remove the file after upload
    fs.unlinkSync(filePath);

    res.json({
      url: result.secure_url,
      public_id: result.public_id
    });
  } catch (error) {
    res.status(500).json({ message: 'Upload failed', error });
  }
};


// ✅ Multer config
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  },
});

const upload = multer({ storage });

// ✅ Type-safe route handler
uploadRouter
.post(
  "/",
  upload.single("file"),
  uploadImage
);

export default uploadRouter;
