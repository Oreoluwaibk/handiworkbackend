import { Request, Response, Router } from "express";
import User from "../schema/userSchema";
import { authentication } from "../middleware/authentication";
import { getPagination } from "../utils/pagination";
import Skill from "../schema/skillsSchema";
import ArtisanRequest from "../schema/artisanRequest";
import ArtisanRequestBid from "../schema/artisanRequestBidSchema";
import Quotes from "../schema/quoteSchema";
import { sendArtisanRequestEmail } from "../utils/email";
import { saveNotifcation } from "../utils/saveNotification";
import { findMatchingArtisans, ownsArtisanRequest } from "../utils/artisanRequest";

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
.get("/requests", authentication, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { status } = req.query;

  try {
    const { limit, skip, page } = getPagination(req);
    const query: Record<string, unknown> = {
      $or: [
        { user_id: user._id.toString() },
        { email: new RegExp(`^${String(user.email || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
      ],
    };

    if (status) query.status = status;

    const [requests, total] = await Promise.all([
      ArtisanRequest.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
      ArtisanRequest.countDocuments(query),
    ]);

    const requestIds = requests.map((item) => item._id.toString());
    const bidCounts = await ArtisanRequestBid.aggregate([
      { $match: { artisan_request_id: { $in: requestIds }, status: "pending" } },
      { $group: { _id: "$artisan_request_id", count: { $sum: 1 } } },
    ]);
    const bidCountMap = bidCounts.reduce((map, row) => {
      map[row._id] = row.count;
      return map;
    }, {} as Record<string, number>);

    const enriched = requests.map((item) => ({
      ...item.toObject(),
      bid_count: bidCountMap[item._id.toString()] || 0,
    }));

    return res.status(200).json({
      message: "Success",
      requests: enriched,
      page,
      total,
      pages: Math.ceil(total / Math.max(limit, 1)),
    });
  } catch (error: any) {
    return res.status(500).json({ message: `Unable to get artisan requests: ${error.message}` });
  }
})
.get("/request/open", authentication, async (req: Request, res: Response) => {
  const user = (req as any).user;

  try {
    if (!user.is_vendor) {
      return res.status(403).json({ message: "Only vendors can view open artisan requests" });
    }

    if (!user.area) {
      return res.status(400).json({ message: "Set your location in profile to see open requests" });
    }

    const vendorSkills = new Set<string>(
      [user.primary_skill, ...(user.skill || [])].filter(Boolean) as string[]
    );

    if (vendorSkills.size === 0) {
      return res.status(400).json({ message: "Add your craft/skills in profile to see open requests" });
    }

    const { limit, skip, page } = getPagination(req);
    const query = {
      status: "pending",
      area: user.area,
      skill_id: { $in: Array.from(vendorSkills) },
    };

    const [requests, total] = await Promise.all([
      ArtisanRequest.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
      ArtisanRequest.countDocuments(query),
    ]);

    const requestIds = requests.map((item) => item._id.toString());
    const myBids = await ArtisanRequestBid.find({
      artisan_request_id: { $in: requestIds },
      vendor_id: user._id.toString(),
    }).select("artisan_request_id amount status comment");

    const myBidMap = myBids.reduce((map, bid) => {
      map[bid.artisan_request_id] = bid;
      return map;
    }, {} as Record<string, any>);

    const enriched = requests.map((item) => ({
      ...item.toObject(),
      my_bid: myBidMap[item._id.toString()] || null,
    }));

    return res.status(200).json({
      message: "Success",
      requests: enriched,
      page,
      total,
      pages: Math.ceil(total / Math.max(limit, 1)),
    });
  } catch (error: any) {
    return res.status(500).json({ message: `Unable to get open requests: ${error.message}` });
  }
})
.get("/request/:id", authentication, async (req: Request, res: Response) => {
  const user = (req as any).user;

  try {
    const request = await ArtisanRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ message: "Artisan request not found" });
    }

    const isOwner = ownsArtisanRequest(request, user);
    const vendorSkills = new Set<string>(
      [user.primary_skill, ...(user.skill || [])].filter(Boolean) as string[]
    );
    const isMatchingVendor =
      user.is_vendor &&
      request.area === user.area &&
      request.skill_id &&
      vendorSkills.has(request.skill_id);

    if (!isOwner && !isMatchingVendor) {
      return res.status(403).json({ message: "You cannot view this request" });
    }

    const bidCount = await ArtisanRequestBid.countDocuments({
      artisan_request_id: request._id.toString(),
      status: "pending",
    });

    let myBid = null;
    if (user.is_vendor) {
      myBid = await ArtisanRequestBid.findOne({
        artisan_request_id: request._id.toString(),
        vendor_id: user._id.toString(),
      });
    }

    return res.status(200).json({
      message: "Success",
      request: {
        ...request.toObject(),
        bid_count: bidCount,
        my_bid: myBid,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ message: `Unable to get request: ${error.message}` });
  }
})
.get("/request/:id/bids", authentication, async (req: Request, res: Response) => {
  const user = (req as any).user;

  try {
    const request = await ArtisanRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ message: "Artisan request not found" });
    }

    if (!ownsArtisanRequest(request, user)) {
      return res.status(403).json({ message: "Only the request owner can view bids" });
    }

    const bids = await ArtisanRequestBid.find({
      artisan_request_id: request._id.toString(),
      status: { $in: ["pending", "selected"] },
    }).sort({ createdAt: -1 });

    return res.status(200).json({
      message: "Success",
      bids,
      request,
    });
  } catch (error: any) {
    return res.status(500).json({ message: `Unable to get bids: ${error.message}` });
  }
})
.post("/request/:id/bid", authentication, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { amount, comment } = req.body;

  try {
    if (!user.is_vendor) {
      return res.status(403).json({ message: "Only vendors can bid on requests" });
    }

    const request = await ArtisanRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ message: "Artisan request not found" });
    }

    if (request.status !== "pending") {
      return res.status(400).json({ message: "This request is no longer accepting bids" });
    }

    const vendorSkills = new Set<string>(
      [user.primary_skill, ...(user.skill || [])].filter(Boolean) as string[]
    );

    if (!request.skill_id || !vendorSkills.has(request.skill_id)) {
      return res.status(403).json({ message: "This request does not match your craft" });
    }

    if (request.area && user.area !== request.area) {
      return res.status(403).json({ message: "This request is outside your service area" });
    }

    const parsedAmount = parseFloat(String(amount));
    if (!parsedAmount || parsedAmount <= 0) {
      return res.status(400).json({ message: "Enter a valid bid amount" });
    }

    const existingBid = await ArtisanRequestBid.findOne({
      artisan_request_id: request._id.toString(),
      vendor_id: user._id.toString(),
    });

    if (existingBid) {
      existingBid.amount = parsedAmount;
      existingBid.comment = comment || "";
      existingBid.status = "pending";
      await existingBid.save();

      if (request.user_id) {
        await saveNotifcation(
          "Bid updated on your request",
          `${user.first_name} ${user.last_name} updated their bid to ₦${parsedAmount.toLocaleString()} for ${request.title}`,
          request.user_id,
          "artisan_request",
          request._id.toString()
        );
      }

      return res.status(200).json({
        message: "Your bid has been updated",
        bid: existingBid,
      });
    }

    const bid = await ArtisanRequestBid.create({
      artisan_request_id: request._id.toString(),
      vendor_id: user._id.toString(),
      vendor: {
        id: user._id.toString(),
        name: `${user.first_name} ${user.last_name}`,
        picture: user.picture,
      },
      amount: parsedAmount,
      comment: comment || "",
      status: "pending",
    });

    if (request.user_id) {
      await saveNotifcation(
        "New bid on your artisan request",
        `${bid.vendor.name} sent a bid of ₦${parsedAmount.toLocaleString()} for ${request.title}`,
        request.user_id,
        "artisan_request",
        request._id.toString()
      );
    }

    return res.status(201).json({
      message: "Bid submitted successfully",
      bid,
    });
  } catch (error: any) {
    if (error?.code === 11000) {
      return res.status(400).json({ message: "You have already submitted a bid for this request" });
    }
    return res.status(500).json({ message: `Unable to submit bid: ${error.message}` });
  }
})
.put("/request/:id/select/:bidId", authentication, async (req: Request, res: Response) => {
  const user = (req as any).user;

  try {
    const request = await ArtisanRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ message: "Artisan request not found" });
    }

    if (!ownsArtisanRequest(request, user)) {
      return res.status(403).json({ message: "Only the request owner can select a bid" });
    }

    if (request.status !== "pending") {
      return res.status(400).json({ message: "An artisan has already been selected for this request" });
    }

    const bid = await ArtisanRequestBid.findById(req.params.bidId);
    if (!bid || bid.artisan_request_id !== request._id.toString()) {
      return res.status(404).json({ message: "Bid not found" });
    }

    if (bid.status !== "pending") {
      return res.status(400).json({ message: "This bid is no longer available" });
    }

    const vendorUser = await User.findById(bid.vendor_id);
    if (!vendorUser) {
      return res.status(404).json({ message: "Selected artisan not found" });
    }

    const quote = await Quotes.create({
      title: request.title,
      description: request.problem,
      requester: {
        id: user._id.toString(),
        name: `${user.first_name} ${user.last_name}`,
        picture: user.picture,
      },
      vendor: {
        id: vendorUser._id.toString(),
        name: `${vendorUser.first_name} ${vendorUser.last_name}`,
        picture: vendorUser.picture,
      },
      amount: bid.amount,
      vendor_comment: bid.comment || "",
      status: "replied",
      artisan_request_id: request._id.toString(),
    });

    bid.status = "selected";
    await bid.save();

    await ArtisanRequestBid.updateMany(
      {
        artisan_request_id: request._id.toString(),
        _id: { $ne: bid._id },
        status: "pending",
      },
      { status: "rejected" }
    );

    request.status = "assigned";
    request.selected_bid_id = bid._id.toString();
    request.quote_id = quote._id.toString();
    await request.save();

    await saveNotifcation(
      "You were selected for a job",
      `${user.first_name} ${user.last_name} chose your bid for ${request.title}. Awaiting their acceptance.`,
      vendorUser._id,
      "quote",
      quote._id.toString()
    );

    await saveNotifcation(
      "Artisan selected",
      `You selected ${bid.vendor.name}. Review and accept the bid to start the job.`,
      user._id,
      "quote",
      quote._id.toString()
    );

    return res.status(200).json({
      message: "Artisan selected. Accept the bid to confirm the job.",
      request,
      quote,
    });
  } catch (error: any) {
    return res.status(500).json({ message: `Unable to select bid: ${error.message}` });
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
    const user = (req as any).user;
    const { name, email, phone, address, problem, title, skill_id } = req.body;

    if (!name || !email || !phone || !address || !problem || !title || !skill_id) {
      return res.status(400).json({
        success: false,
        message: "All fields including craft selection are required",
      });
    }

    if (!user.area) {
      return res.status(400).json({
        success: false,
        message: "Set your location in profile before requesting an artisan",
      });
    }

    const skill = await Skill.findById(skill_id);
    if (!skill) {
      return res.status(400).json({ success: false, message: "Selected craft is invalid" });
    }

    const artisanRequest = await ArtisanRequest.create({
      name,
      email,
      phone,
      address,
      problem,
      title: skill.title,
      skill_id: skill._id.toString(),
      area: user.area,
      user_id: user._id.toString(),
      status: "pending",
    });

    const matchingArtisans = await findMatchingArtisans(skill._id.toString(), user.area);

    await Promise.all(
      matchingArtisans
        .filter((artisan) => artisan._id.toString() !== user._id.toString())
        .map((artisan) =>
          saveNotifcation(
            "New artisan request near you",
            `${name} needs a ${skill.title} in ${user.area}: ${problem}`,
            artisan._id,
            "artisan_request",
            artisanRequest._id.toString()
          )
        )
    );

    await sendArtisanRequestEmail({
      ...artisanRequest.toObject(),
      createdAt: artisanRequest.createdAt?.toLocaleString(),
    }).catch((error) => console.error("Admin artisan request email failed:", error));

    return res.status(201).json({
      success: true,
      message: `Request sent to ${matchingArtisans.length} matching artisan(s) in your area`,
      request: artisanRequest,
      notified_count: matchingArtisans.length,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: `Unable to submit artisan request: ${error}`,
    });
  }
})
.put("/request/:id/cancel", authentication, async (req: Request, res: Response) => {
  const user = (req as any).user;

  try {
    const request = await ArtisanRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ message: "Artisan request not found" });
    }

    const ownsRequest =
      request.user_id === user._id.toString() ||
      String(request.email || "").toLowerCase() === String(user.email || "").toLowerCase();

    if (!ownsRequest) {
      return res.status(403).json({ message: "You can only cancel your own request" });
    }

    if (!["pending", "assigned"].includes(request.status)) {
      return res.status(400).json({
        message: "Only open requests awaiting bids or acceptance can be cancelled",
      });
    }

    if (request.quote_id) {
      const linkedQuote = await Quotes.findById(request.quote_id);
      if (linkedQuote && !["pending", "replied", "declined"].includes(linkedQuote.status)) {
        return res.status(400).json({
          message: "This request can no longer be cancelled because work has started",
        });
      }
    }

    request.status = "cancelled";
    await request.save();

    if (request.quote_id) {
      await Quotes.findByIdAndUpdate(request.quote_id, { status: "declined" });
    }

    await ArtisanRequestBid.updateMany(
      { artisan_request_id: request._id.toString(), status: "pending" },
      { status: "rejected" }
    );

    return res.status(200).json({
      success: true,
      message: "Artisan request cancelled",
      request,
    });
  } catch (error: any) {
    return res.status(500).json({ message: `Unable to cancel request: ${error.message}` });
  }
});

export default vendorRouter;
