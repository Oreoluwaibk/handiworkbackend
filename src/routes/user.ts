import { Request, Response, Router } from "express";
import User from "../schema/userSchema";
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authentication } from "../middleware/authentication";
import { requireAdminKey } from "../middleware/adminAuth";
import cloudinary from "../utils/cloudinary";
import mongoose from "mongoose";

const userRouter = Router();

const PROFILE_FIELDS = [
  "first_name",
  "last_name",
  "phone_number",
  "address",
  "address_line2",
  "postal_code",
  "state",
  "country",
  "area",
  "bio",
  "nin",
  "skill",
  "work_images",
] as const;

const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    cb(null, uploadDir);
  },
  filename: function (_req, file, cb) {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({ storage });

userRouter
.post("/change-picture", authentication, upload.single('image'), async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;

    if (!req.file) {
      res.status(400).json({ message: 'No file uploaded' });
      return;
    }

    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    const filePath = req.file.path;
    const result = await cloudinary.uploader.upload(filePath, {
      folder: 'handiwork_users',
    });

    fs.unlinkSync(filePath);
    user.picture = result.secure_url;
    await user.save();

    res.status(200).json({
      message: 'Picture updated successfully',
      imageUrl: result.secure_url,
      public_id: result.public_id,
    });
  } catch (error: any) {
    console.error("Error changing picture:", error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
})
.post(
  "/upload-work",
  authentication,
  upload.array("images", 8),
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;

      if (!req.files || !(req.files instanceof Array) || req.files.length === 0) {
        return res.status(400).json({ message: "No files uploaded" });
      }

      if (req.files.length > 8) {
        return res.status(400).json({ message: "You can only upload a maximum of 8 images." });
      }

      const uploadResults: { url: string; public_id: string }[] = [];

      for (const file of req.files) {
        const filePath = (file as Express.Multer.File).path;
        const result = await cloudinary.uploader.upload(filePath, {
          folder: "handiwork_workdone",
        });

        uploadResults.push({
          url: result.secure_url,
          public_id: result.public_id,
        });

        fs.unlinkSync(filePath);
      }

      const currentImages = user.work_images || [];
      let finalImages: string[] = [];

      if (uploadResults.length <= currentImages.length) {
        finalImages = [...currentImages, ...uploadResults.map((r) => r.url)].slice(0, 8);
      } else {
        finalImages = uploadResults.map((r) => r.url);
      }

      user.work_images = finalImages;
      await user.save();

      res.status(200).json({
        message: "Work images updated successfully",
        images: finalImages,
      });
    } catch (error: any) {
      console.error("Error uploading work images:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }
)
.get("/all", authentication, async (_req: Request, res: Response) => {
  try {
    const allUsers = await User.find({ is_vendor: false }).select('-password -__v');

    if (!allUsers || allUsers.length === 0) {
      res.status(404).json({ message: 'No users found' });
      return;
    }

    res.status(200).json({
      message: 'Success',
      users: allUsers,
      count: allUsers.length,
    });
  } catch (error: any) {
    res.status(500).json({
      message: `Unable to get users - ${error.message || error.toString()}`,
    });
  }
})
.get("/emails", authentication, requireAdminKey, async (_req: Request, res: Response) => {
  try {
    const emails = await User.find({}, { email: 1, _id: 0 });

    return res.status(200).json({
      message: "List of all user emails",
      emails,
    });
  } catch (error: any) {
    console.error("Error fetching user emails:", error);
    return res.status(500).json({
      message: "Unable to fetch user emails",
      error: error.message,
    });
  }
})
.get("/chat/:chatId", authentication, async (req: Request, res: Response) => {
  const { chatId } = req.params;

  try {
    const user = await User.findOne({ chat_id: chatId }).select(
      "first_name last_name phone_number email picture chat_id"
    );

    if (!user) {
      return res.status(404).json({
        message: `User with chat_id ${chatId} not found`,
      });
    }

    return res.status(200).json({
      message: "User found",
      user,
    });
  } catch (error: any) {
    console.error(`Error fetching user by chat_id ${chatId}:`, error);
    return res.status(500).json({
      message: "Unable to fetch user",
      error: error.message,
    });
  }
})
.put("/update-profile", authentication, async (req: Request, res: Response) => {
  const { nin, area, phone_number } = req.body;

  try {
    const user = (req as any).user;

    if (nin && nin.toString().length !== 11) {
      res.status(400).json({ message: "NIN should be 11 digits" });
      return;
    }

    if (!phone_number) {
      res.status(400).json({ message: "Kindly input your phone number" });
      return;
    }

    if (!area) {
      res.status(400).json({ message: "Kindly input your location in Abuja" });
      return;
    }

    if (user.is_vendor && user.is_active) {
      res.status(400).json({
        message: "This vendor is currently active and has not completed the current task! Complete task to update profile",
      });
      return;
    }

    for (const field of PROFILE_FIELDS) {
      if (req.body[field] !== undefined) {
        user[field] = req.body[field];
      }
    }

    const savedUser = await user.save();

    res.status(200).json({
      message: "Your profile has been saved successfully",
      user: savedUser,
    });
  } catch (error: any) {
    res.status(500).json({
      message: "Unable to edit user, please try again",
      error: error.message,
    });
  }
})
.put("/update-usertype", authentication, async (req: Request, res: Response) => {
  const user = (req as any).user;

  try {
    if (user.is_active) {
      res.status(400).json({
        message: "This vendor is currently active and has not completed the current task!",
      });
      return;
    }

    user.is_vendor = !user.is_vendor;
    await user.save();

    res.status(200).json({
      message: user.is_vendor
        ? "This user has been updated to a vendor"
        : "This vendor has been updated to a user",
      user,
    });
  } catch (error: any) {
    res.status(500).json({
      message: "This user type cannot be updated",
      error: error.message,
    });
  }
})
.delete("/", authentication, async (req: Request, res: Response) => {
  const { email, is_active } = (req as any).user;

  try {
    const user = await User.findOne({ email });

    if (!user) {
      res.status(404).json({ message: "User not found." });
      return;
    }

    if (is_active) {
      res.status(400).json({
        message: "This vendor is currently active and has not completed current task!",
      });
      return;
    }

    user.is_deleted = true;
    await user.save();

    res.status(200).json({
      message: "User has been deactivated!",
    });
  } catch (error) {
    res.status(500).json({
      message: `This user could not be deleted - ${error}`,
    });
  }
})
.delete("/hard", authentication, requireAdminKey, async (req: Request, res: Response) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: "email is required" });
  }

  try {
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    await User.deleteOne({ email });

    return res.status(200).json({
      message: "User has been permanently deleted.",
    });
  } catch (error) {
    return res.status(500).json({
      message: `This user could not be deleted - ${error}`,
    });
  }
})
.delete("/drop-referral-index", authentication, requireAdminKey, async (_req: Request, res: Response) => {
  try {
    const collection = mongoose.connection.collection("users");
    await collection.dropIndex("referral_code_1");

    return res.status(200).json({
      message: "Index 'referral_code_1' successfully dropped!",
    });
  } catch (error: any) {
    if (error.code === 27) {
      return res.status(200).json({
        message: "Index does not exist or already removed.",
      });
    }

    console.error("Drop index error:", error);
    return res.status(500).json({
      message: "Failed to drop referral_code index",
      error: error.message,
    });
  }
});

export default userRouter;
