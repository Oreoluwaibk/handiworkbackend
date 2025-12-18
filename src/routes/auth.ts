import { Request, Response, Router } from "express";
import User from "../schema/userSchema";
import Wallet from "../schema/walletSchema";
import { createToken, generateOtp, resetToken, verifyToken } from "../utils/tokens";
import bcryptjs from "bcryptjs";
import { sendOtp } from "../utils/email";
import { v4 as uuidv4 } from 'uuid';
import Transaction from "../schema/transactionSchema";
import Notification from "../schema/notificationScheme";

const salt = 10;
const authRouter = Router();

authRouter
.post("/register", async (req: Request, res: Response) => {
  try {
    const { first_name, last_name, email, password, referred_by } = req.body;

    // 🔹 Check if user already exists
    const isUser = await User.findOne({ email });
    if (isUser) {
      return res
        .status(400)
        .json({ message: "User already exists, kindly login to continue" });
    }

    // 🔹 Validate referral code (ONLY super vendor with active subscription)
    let validReferrer: any | null = null;
    if (referred_by) {
      validReferrer = await User.findOne({
        referral_code: referred_by,
        is_vendor: true,
        "subscription.active": true
      });

      if (!validReferrer) {
        return res.status(400).json({ message: "Invalid referral code" });
      }
    }

    const salt = bcryptjs.genSaltSync(10);
    const hashedPassword = bcryptjs.hashSync(password, salt);

    const chat_id = uuidv4();

    // 🔹 Create new user (NO referral code yet)
    const user = await User.create({
      ...req.body,
      password: hashedPassword,
      picture: null,
      chat_id,

      referral_code: null, // Generated only after subscription
      referred_by: validReferrer ? validReferrer.referral_code : null,

      subscription: {
        plan_name: null,
        amount: 0,
        active: false,
        start_date: null,
        renewed_at: null
      }
    });

    // 🔹 Create wallet for user
    const wallet = new Wallet({
      user_id: user._id,
      currency_code: "NGN",
      balance: 0,
      is_active: true
    });

    await wallet.save();

    const token = createToken({
      first_name,
      last_name,
      email,
      _id: user._id
    });

    res.status(200).json({
      token,
      message: "Registration successful",
      user
    });

  } catch (error: any) {
    console.error("Registration error:", error);

    res.status(500).json({
      success: false,
      message: `Unable to create user: ${error.message}`
    });
  }
})
.post("/login", async(req: Request, res: Response) => {
    const { email, password, expoPushToken  } = req.body;
    try {
        const user = await User.findOne({
            email: email
        });
        
        if(!user) {
            res.status(404).json({
                suceess: false, 
                message: "User does not exist, kindly register to continue!"
            });
            return;
        }
        if(user.is_deleted) {
            res.status(404).json({
                suceess: false, 
                message: "User has been deactiviated, kindly reactivate your account or contact admin!"
            });
            return;
        }
        const isPasswordCorrect = bcryptjs.compareSync(password, user?.password);
    
        if(!isPasswordCorrect) {
            res.status(401).json({success: false, message: "Incorrect password!"});
            return;
        }

        if (expoPushToken) {
          await User.findByIdAndUpdate(user._id, {
            $addToSet: { expo_push_tokens: expoPushToken },
          });
        }

        const userDetails = {
            first_name: user.first_name, 
            last_name: user.last_name, 
            hashedPassword: user.password, 
            email, 
            phone_number: user.phone_number
        };
        // const chat_id = uuidv4();
        // if(!user.chat_id) {
        //     user.chat_id = chat_id;
        //     await user.save();
        //     console.log("chat +id", chat_id);
            
        // }
        // const wallet = new Wallet({
        //     user_id: user._id,
        //     currency_code: "NGN",
        //     balance: 0,
        //     is_active: true
        // });
        // await wallet.save();
    
        const token = createToken(userDetails);
    
        res.status(200).json({
            success: true,
            message: "login successful",
            user,
            token
        })
    } catch (error) {
        console.log("err", error);
        
        res.status(500).send(`Cannot login - ${error}`)
    }
    
})
.post("/forgot-password", async(req: Request, res: Response) => {
    const { email } = req.body;

    const user = await User.findOne({ email });

    if(!user) res.status(404).json({message: "user does not exist!"});
    else {
        const { first_name, password, phone_number } = user;

        const userDetails = {first_name, password, email, phone_number};

        const token = resetToken(userDetails);
        const otp = generateOtp();

        user.resetToken = token;
        user.otp = otp;

        await user.save();
        sendOtp(email, otp, user.first_name)
        .then((resp) => {
            res.status(200).json({
                success: true,
                message: "otp sent successful, kindly check mail or spam",
                token
            })
        })
        .catch((err) => {
            res.status(400).json({message: "Unable to reset your password, try again or contact admin!"});  
        })
    }
})
.post("/reset-password/:token", async(req: Request, res: Response) => {
    const { token } = req.params;
    const { email, otp, password } = req.body;

    const { valid } = verifyToken(token);

    if(!valid) res.status(401).json({
        message: "invalid token"
    });
    else {
        const user = await User.findOne({
            email: email
        });
        
        if(user) {
            if(Number(otp) !== user.otp) {
                res.status(400).send("Otp has expired!")
            }else if(token !== user.resetToken) {
                res.status(400).send("token is not valid!")
            }else {
                const hashedPassword = bcryptjs.hashSync(password, salt);
    
                user.password = hashedPassword;
                user.resetToken = "";
                user.otp = null;
            
                await user.save();
            
                res.status(200).json({
                    success: true,
                    message: "password reset successful"
                })
            }
        }
    }
})


export default authRouter;