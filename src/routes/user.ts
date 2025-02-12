import { Request, Response, Router } from "express";
import User from "../schema/userSchema";
import { verifyToken } from "../utils/tokens";

const userRouter = Router();

userRouter
.post("/change_picture", async (req: Request, res: Response) => {
   
})
.put("/update_profile", async(req: Request, res: Response) => {
    const { email, NIN, area, phone_number } = req.body;

    try {
        const user = await User.findOne({ email });
        if(!user) {
            res.status(404).send("User with this email does not exist!");
            return;
        }

        if(NIN && NIN.toString().length !== 11) {
            res.status(400).send("NIN should be 10 digit");
            return;
        }

        if(!phone_number) {
            res.status(400).send("Kindly input your phone number");
            return;
        }

        if(!area) {
            res.status(400).send("Kindly input your location in abuja");
            return;
        }
    
        await user.updateOne({
            ...req.body
        });
        const saved = await user.save();
        res.status(200).json({
            user: saved,
            message: "Success"
        })
    } catch (error: any) {
        res.status(500).send(`Unable to edit user, please try again - ${error}`)
    }
})
.put("/update_usertype", async (req: Request, res: Response) => {
     const { authorization } = req.headers;
    const verify = verifyToken(authorization);
    if(!verify.valid) {
        res.status(401).send("Token not valid");
        return;
    }

    try {
        const { email } = verify.isVerified as any;
        const user = await User.findOne({ email });

        if(user) {
            if(user.is_vendor) {
                user.is_vendor = false;
                await user.save(); 

                res.status(200).json({ message: "Vendor is now a user", user })
            }else {
                user.is_vendor = true;
                await user.save();

                res.status(200).json({ message: "User is already a vendor", user })
            }

            
        }
    } catch (error) {
        res.status(500).send(`This user cannot be a vendor - ${error}`)
    }
})


export default userRouter;