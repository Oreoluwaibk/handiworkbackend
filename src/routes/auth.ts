import { Request, Response, Router } from "express";
import User from "../schema/userSchema";
import { createToken, generateOtp, resetToken, verifyToken } from "../utils/tokens";
import bcryptjs from "bcryptjs";
import { sendMail, sendOTP } from "../utils/email";


const salt = 10;

const authRouter = Router();

authRouter
.post("/register", async (req: Request, res: Response) => {
    console.log("req", req.body);
    try {
        const { first_name, last_name, email, password } = req.body;
        const isUser = await User.findOne({
            email: email 
        });

        if(!isUser) {
            const hashedPassword = bcryptjs.hashSync(password, salt);

            const userDetails = {first_name, last_name, email};

            const token = createToken(userDetails);

            const user = await User.create({
                ...req.body,
                password: hashedPassword
            });

            await user.save();
            
            res.status(200).json({
                token,
                message: "Registration successfully",
                user
            })
        }else{
            res.status(403).send("user already exist, kindly login to continue")
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            message: `unable to create user, ${error}`
        })
    }

})
.post("/login", async(req: Request, res: Response) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({
            email: email
        });
        
        console.log("user", user);
        
    
        if(!user) {
            res.status(404).json({
                suceess: false, 
                message: "User does not exist, kindly register to continue!"
            });
            return;
        }
        const isPasswordCorrect = bcryptjs.compareSync(password, user?.password);
    
        if(!isPasswordCorrect) {
            res.status(401).json({success: false, message: "Incorrect password!"});
            return;
        }
    
        const userDetails = {
            first_name: user.first_name, 
            last_name: user.last_name, 
            hashedPassword: user.password, 
            email, 
            phone_number: user.phone_number
        };
    
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

    const user = await User.findOne({
        email
    });

    if(!user) res.status(404).send("user does not exist!");
    else {
        const { first_name, password, phone_number } = user;

        const userDetails = {first_name, password, email, phone_number};

        const token = resetToken(userDetails);
        const otp = generateOtp();

        console.log("toor", otp);
        

        user.resetToken = token;
        user.otp = otp;
        

        await user.save();

        sendOTP({ email, otp })
        .then((resp) => {
            console.log("re", resp);
            res.status(200).json({
                success: true,
                message: "otp sent successful",
                token
            })
        })
        .catch((err) => {
            console.log("er",err);
            res.status(400).send("Soemthing went wrong!");  
        })
    }
})
.post("/reset-password/:token", async(req: Request, res: Response) => {
    const { token } = req.params;
    const { email, otp, password } = req.body;

    const isVerified = verifyToken(token);

    if(!isVerified) res.status(401).json({
        message: "invalid token"
    });
    else {
        const user = await User.findOne({
            email: email
        });

        if(user) {
            if(otp !== user.otp) {
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