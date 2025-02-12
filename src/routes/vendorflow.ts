import { Request, Response, Router } from "express";
import User from "../schema/userSchema";
import { verifyToken } from "../utils/tokens";

const vendorRouter = Router();

vendorRouter
.get("/nearby", async (req: Request, res: Response) => {
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
         const userArea = user.area;
         if(userArea) {
            const allvendors = await User.find({ area: userArea, is_vendor: true });
   
            res.status(200).json({
               vendor_nearby: allvendors,
               message: "Success"
            })
         }else res.status(400).send("You have not set your location, kindly set to use this feature!");
      } else res.status(400).send("No user found!")
   } catch (error: any) {
      console.log("all ", error?.response, error);
      res.status(500).send(`Unable to edit user, please try again - ${error}`)
   } 
})
.get("/:id", async(req: Request, res: Response) => {
   const { authorization } = req.headers;
   const { id } = req.params;
   const verify = verifyToken(authorization);
   if(!verify.valid) {
      res.status(401).send("Token not valid");
      return;
   }

   const vendor = await User.findById({ _id: id });

   if(!vendor) {
      res.status(400).send("No vendor with this id found");
      return;
   }

   res.status(200).json({
      vendor,
      message: "Success"
   })
})

export default vendorRouter;