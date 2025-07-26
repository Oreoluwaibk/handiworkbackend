import { Router, Request, Response } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";

const uploadRouter = Router();

// ✅ Ensure uploads/messages directory exists
const uploadDir = path.join(__dirname, "..", "uploads", "messages");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

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
  async (req: Request, res: Response) => {
    console.log("is here?");
    
    if (!req.file) {
       res.status(400).json({ error: "No file uploaded" });
       return
    }

    // Build public URL
    const fileUrl = `/uploads/messages/${req.file.filename}`;

    res.status(200).json({
      success: true,
      message: "File uploaded successfully",
      url: fileUrl,
    });
  }
);

export default uploadRouter;
