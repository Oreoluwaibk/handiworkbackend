import { Request, Response, Router } from "express";
import User from "../schema/userSchema";
import { verifyToken } from "../utils/tokens";
import { authentication } from "../middleware/authentication";
import { getPagination } from "../utils/pagination";
import Skill from "../schema/skillsSchema";

const vendorRouter = Router();

vendorRouter
.get("/nearby/:id", authentication, async (req: Request, res: Response) => {
   const user = (req as any).user;
   const { id } = req.params;
   
   try {
      const skill = await Skill.findById(id);
      
      if (!user) {
         res.status(400).json({message: "No user found!"});
         return
      }

      if(!skill) {
         res.status(400).json({message: "Select a skill to get vendor nearby!"});
         return
      }

      const userArea = user.area;
      if (!userArea) {
         res.status(400).json({message: "You have not set your location, kindly set to use this feature!"});
         return;
      }

      const { limit, skip, page } = getPagination(req);
      const query = {
         area: userArea,
         is_vendor: true,
         skill: { $in: [skill.id] },
      };

      const [allvendors, total] = await Promise.all([
         User.find(query)
            .select('-password -otp -resetToken -nin')
            .skip(skip)
            .limit(limit),
         User.countDocuments(query),
      ]);

      res.status(200).json({
         message: "Success",
         vendor_nearby: allvendors,
         page,
         total,
         pages: Math.ceil(total / limit),
      });
   } catch (error: any) {
      res.status(500).json({message: `Unable to get vendors: ${error.message}`});
   }
})
.get("/recommended", async (req: Request, res: Response) => {
   const { authorization } = req.headers;
   const verify = verifyToken(authorization);
   if(!verify.valid) {
      res.status(401).send("Token not valid");
      return;
   }

    try {
      const allvendors = await User.find({ is_vendor: true, is_recommended: true });
      if(allvendors) {
         res.status(200).json({
            allvendors,
            message: "Success"
         })
      } else res.status(400).send("No vendor found!")
   } catch (error: any) {
      res.status(500).json({message: `Unable to get vendors - ${error}`})
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
      const allvendors = await User.find({ is_vendor: true });
      if(allvendors) {
         res.status(200).json({
            allvendors,
            message: "Success"
         })
      } else res.status(400).send("No vendor found!")
   } catch (error: any) {
      res.status(500).json({message: `Unable to get vendors - ${error}`})
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