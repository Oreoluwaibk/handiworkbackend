import { Request, Response, Router } from "express";
import User from "../schema/userSchema";
import { authentication } from "../middleware/authentication";
import { getPagination } from "../utils/pagination";
import Skill from "../schema/skillsSchema";
import ArtisanRequest from "../schema/artisanRequest";
import { sendArtisanRequestEmail } from "../utils/email";

const vendorRouter = Router();

const safeVendorSelect = "-password -otp -resetToken -nin";

vendorRouter
.get("/nearby/:id", authentication, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { id } = req.params;

  try {
    const skill = await Skill.findById(id);

    if (!user) {
      res.status(400).json({ message: "No user found!" });
      return;
    }

    if (!skill) {
      res.status(400).json({ message: "Select a skill to get vendor nearby!" });
      return;
    }

    const userArea = user.area;
    if (!userArea) {
      res.status(400).json({ message: "You have not set your location, kindly set to use this feature!" });
      return;
    }

    const { limit, skip, page } = getPagination(req);
    const query = {
      area: userArea,
      is_vendor: true,
      skill: { $in: [skill._id] },
    };

    const [allvendors, total] = await Promise.all([
      User.find(query)
        .select(safeVendorSelect)
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
    res.status(500).json({ message: `Unable to get vendors: ${error.message}` });
  }
})
.get("/recommended", authentication, async (_req: Request, res: Response) => {
  try {
    const vendors = await User.find({
      is_vendor: true,
      "subscription.active": true,
      is_recommended: true,
    })
      .select(safeVendorSelect)
      .lean();

    if (!vendors.length) {
      return res.status(200).json({
        message: "No recommended vendors available.",
        vendors: [],
      });
    }

    res.status(200).json({
      message: "Recommended vendors retrieved successfully",
      vendors,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
})
.get("/all", authentication, async (_req: Request, res: Response) => {
  try {
    const allvendors = await User.find({ is_vendor: true }).select(safeVendorSelect);

    res.status(200).json({
      allvendors,
      message: "Success",
    });
  } catch (error: any) {
    res.status(500).json({ message: `Unable to get vendors - ${error}` });
  }
})
.get("/:id", authentication, async (req: Request, res: Response) => {
  const { id } = req.params;

  const vendor = await User.findById(id).select(safeVendorSelect);

  if (!vendor) {
    res.status(400).send("No vendor with this id found");
    return;
  }

  res.status(200).json({
    vendor,
    message: "Success",
  });
})
.post("/request", authentication, async (req: Request, res: Response) => {
  try {
    const { name, email, phone, address, problem, title } = req.body;

    if (!name || !email || !phone || !address || !problem) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    const artisanRequest = await ArtisanRequest.create({
      name,
      email,
      phone,
      address,
      problem,
      title,
    });

    await sendArtisanRequestEmail({
      ...artisanRequest.toObject(),
      createdAt: artisanRequest.createdAt?.toLocaleString(),
    });

    return res.status(201).json({
      success: true,
      message: "Artisan request submitted successfully",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: `Unable to submit artisan request: ${error}`,
    });
  }
});

export default vendorRouter;
