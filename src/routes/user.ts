import { Request, Response, Router } from "express";
import User from "../schema/userSchema";
import { verifyToken } from "../utils/tokens";
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authentication } from "../middleware/authentication";
const userRouter = Router();

const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({ storage });

userRouter
.post("/change_picture", upload.single('image'), async (req: Request, res: Response) => {
    try {
        const { authorization } = req.headers;
        if (!authorization) {
            res.status(401).json({ message: 'Authorization header missing' });
            return
        }

        const { valid, isVerified } = verifyToken(authorization);
        if (!valid || !isVerified?.email) {
            res.status(401).json({ message: 'Token is not valid' });
            return
        }

        if (!req.file) {
            res.status(400).json({ message: 'No file uploaded' });
            return
        }

        const user = await User.findOne({ email: isVerified.email });
        if (!user) {
            res.status(404).json({ message: 'User not found' });
            return
        }

        user.picture = `/uploads/${req.file.filename}`;
        await user.save();

        res.status(200).json({
            message: 'Picture updated successfully',
            filePath: user.picture,
            filename: req.file.filename,
        });

    } catch (error: any) {
        console.error("Error changing picture:", error);
        res.status(500).json({ message: 'Server error', error: error.message });
        return
    }
})
.get("/all", async (req: Request, res: Response) => {
   const { authorization } = req.headers;
   const verify = verifyToken(authorization);
   if(!verify.valid) {
      res.status(401).send("Token not valid");
      return;
   }

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
.put("/update_profile", async(req: Request, res: Response) => {
    const { email, nin, area, phone_number } = req.body;

    try {
        const user = await User.findOne({ email });
        if(!user) {
            res.status(404).json({message: "User with this email does not exist!"});
            return;
        }

        if(nin && nin.toString().length !== 11) {
            res.status(400).json({message: "NIN should be 10 digit"});
            return;
        }

        if(!phone_number) {
            res.status(400).json({message: "Kindly input your phone number"});
            return;
        }

        if(!area) {
            res.status(400).json({message: "Kindly input your location in abuja"});
            return;
        }
    
        await user.updateOne({
            ...req.body
        });
        const saved = await user.save();
        res.status(200).json({
            user: saved,
            message: "Your profile has been saved successfully"
        })
    } catch (error: any) {
        res.status(500).json({message: `Unable to edit user, please try again - ${error}`})
    }
})
.put("/update_usertype", async (req: Request, res: Response) => {
    const { authorization } = req.headers;
    const { valid, isVerified } = verifyToken(authorization);
    if(!valid) {
        res
        .status(401)
        .json({message: "Token not valid"});
        return;
    }

    try {
        const { email } = isVerified as any;
        const user = await User.findOne({ email });

        if(!user) {
            res
            .status(404)
            .json({ message: "This user does not exist!"})
            return;
        }
        if(user.is_active) {
            res
            .status(400)
            .json({ message: "This vendor is currently active and has not completed current task!"})
            return;
        }

        if(user.is_vendor) {
            user.is_vendor = false;
            await user.save(); 
            res
            .status(200)
            .json({ 
                message: "This vendor has been updated to a user", 
                user 
            })
        }else {
            user.is_vendor = true;
            await user.save();
            res
            .status(200)
            .json({ 
                message: "This user has been updated to a vendor", 
                user 
            })
        }
    } catch (error) { 
        res
        .status(500)
        .json({
            message: `This user type cannot be updated - ${error}`
        })
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
                message: "This vendor is currently active and has not completed current task!"
            });
            return;
        }

        user.is_deleted = true; 
        await user.save();

        res.status(200).json({
            message: "User has been deactivated!",
        });
        return;

    } catch (error) {
        res.status(500).json({
            message: `This user could not be deleted - ${error}`
        });
        return;
    }
});


export default userRouter;