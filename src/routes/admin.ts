import { Request, Response, Router } from "express";
import bcryptjs from "bcryptjs";
import mongoose from "mongoose";
import User from "../schema/userSchema";
import Wallet from "../schema/walletSchema";
import Transaction from "../schema/transactionSchema";
import ArtisanRequest, { ARTISAN_REQUEST_STATUSES } from "../schema/artisanRequest";
import ArtisanRequestBid from "../schema/artisanRequestBidSchema";
import Support, { SUPPORT_STATUSES } from "../schema/supportSchema";
import Quotes from "../schema/quoteSchema";
import Review from "../schema/reviewSchema";
import Category from "../schema/categorySchema";
import Skill from "../schema/skillsSchema";
import { createToken } from "../utils/tokens";
import { getPagination } from "../utils/pagination";
import { adminAuthentication } from "../middleware/adminAuthentication";
import { requireAdminKey } from "../middleware/adminAuth";
import { processTransaction } from "../utils/ledger";
import { isInflow, isOutflow, sumBy } from "../utils/finance";
import { pipelineCounts, quoteStatusQuery, toQuoteWorkflowStatus } from "../utils/jobStatus";
import { saveNotifcation } from "../utils/saveNotification";
import { sendArtisanRequestUpdateEmail, getArtisanRequestStatusCopy } from "../utils/email";
import { emailMatch, isValidNigerianPhone, normalizeEmail, normalizePhone } from "../utils/authIdentity";
import { writeAuditLog } from "../utils/auditLog";
import { refundQuoteEscrow } from "../utils/quoteEscrow";
import AuditLog from "../schema/auditLogSchema";

const adminRouter = Router();
const saltRounds = 10;

const USER_EDITABLE_FIELDS = [
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
  "skill",
  "picture",
  "is_vendor",
  "is_verified",
  "is_recommended",
  "is_admin",
  "vendor_type",
  "primary_skill",
] as const;

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function searchFilter(search?: string) {
  if (!search?.trim()) return {};
  const regex = new RegExp(escapeRegex(search.trim()), "i");
  return {
    $or: [
      { first_name: regex },
      { last_name: regex },
      { email: regex },
      { phone_number: regex },
      { area: regex },
    ],
  };
}

function startOfDaysAgo(days: number) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - days);
  return date;
}

function startOfMonth() {
  const date = new Date();
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date;
}

function countBy(items: { _id: string | null; count: number }[]) {
  return items.reduce((acc, item) => {
    acc[item._id || "unknown"] = item.count;
    return acc;
  }, {} as Record<string, number>);
}

async function walletBreakdown(userId: string) {
  const [wallet, transactions] = await Promise.all([
    Wallet.findOne({ user_id: userId }),
    Transaction.find({ user_id: userId }).sort({ createdAt: -1 }),
  ]);

  const inflow = sumBy(transactions, isInflow);
  const outflow = sumBy(transactions, isOutflow);

  return { wallet, transactions, inflow, outflow };
}

function applyUserUpdates(user: any, body: Record<string, any>) {
  for (const field of USER_EDITABLE_FIELDS) {
    if (body[field] !== undefined) {
      user[field] = body[field];
    }
  }
}

async function notifyArtisanRequestProgress(request: any) {
  const copy = getArtisanRequestStatusCopy(request.status);

  if (request.email) {
    try {
      await sendArtisanRequestUpdateEmail({
        name: request.name,
        email: request.email,
        title: request.title,
        problem: request.problem,
        status: request.status,
      });
    } catch (error) {
      console.error("Unable to email artisan request update:", error);
    }
  }

  let userId = request.user_id;
  if (!userId && request.email) {
    const user = await User.findOne({
      email: new RegExp(`^${escapeRegex(String(request.email))}$`, "i"),
    }).select("_id");
    userId = user?._id?.toString();
  }

  if (!userId) return;

  await saveNotifcation(
    `Artisan request ${copy.label.toLowerCase()}`,
    copy.message,
    userId,
    "artisan_request",
    request._id.toString()
  );
}

adminRouter.post("/auth/login", async (req: Request, res: Response) => {
  const { email, password, admin_key } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "email and password are required" });
  }

  try {
    const user = await User.findOne(emailMatch(email));

    if (!user) {
      return res.status(404).json({ message: "Admin account not found" });
    }

    if (user.is_deleted) {
      return res.status(403).json({ message: "This account has been deactivated" });
    }

    if (!user.password) {
      return res.status(401).json({ message: "This account uses Google sign-in" });
    }

    const isPasswordCorrect = bcryptjs.compareSync(password, user.password);
    if (!isPasswordCorrect) {
      return res.status(401).json({ message: "Incorrect password" });
    }

    const envKey = process.env.ADMIN_API_KEY || process.env.ADMIN_RESET_KEY;
    const canBootstrap = Boolean(admin_key && envKey && admin_key === envKey);

    if (!user.is_admin && !canBootstrap) {
      return res.status(403).json({ message: "This account does not have admin access" });
    }

    if (!user.is_admin && canBootstrap) {
      user.is_admin = true;
    }

    user.last_login = new Date();
    user.last_device = {
      platform: "web",
      model: "Admin Dashboard",
      os_version: null,
      app_version: "admin",
      brand: "QuikWrk",
    };
    await user.save();

    const token = createToken({
      _id: user._id.toString(),
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      phone_number: user.phone_number,
      is_admin: true,
    });

    return res.status(200).json({
      message: "Admin login successful",
      token,
      user,
    });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
});

adminRouter.post("/auth/setup", requireAdminKey, async (req: Request, res: Response) => {
  const { email, password, first_name, last_name } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "email and password are required" });
  }

  try {
    let user = await User.findOne({ email });

    if (user) {
      user.is_admin = true;
      if (password) {
        user.password = bcryptjs.hashSync(password, saltRounds);
      }
      await user.save();
    } else {
      user = await User.create({
        first_name: first_name || "QuikWrk",
        last_name: last_name || "Admin",
        email,
        password: bcryptjs.hashSync(password, saltRounds),
        is_admin: true,
        is_vendor: false,
        is_verified: true,
        is_active: false,
        is_deleted: false,
      });

      await Wallet.create({
        user_id: user._id,
        currency_code: "NGN",
        balance: 0,
        is_active: true,
      });
    }

    return res.status(200).json({
      message: "Admin account is ready",
      user,
    });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
});

adminRouter.use(adminAuthentication);

adminRouter.get("/auth/me", async (req: Request, res: Response) => {
  return res.status(200).json({
    message: "Current admin",
    user: (req as any).user,
  });
});

adminRouter.get("/stats", async (_req: Request, res: Response) => {
  try {
    const monthStart = startOfMonth();
    const weekStart = startOfDaysAgo(6);

    const [
      totalUsers,
      totalVendors,
      activeCustomers,
      deactivatedAccounts,
      activeSubscriptions,
      artisanByStatus,
      quotesByStatus,
      supportByStatus,
      walletTotals,
      monthTransactions,
      recentUsers,
      recentRequests,
      recentSupport,
      weekSignups,
    ] = await Promise.all([
      User.countDocuments({ is_vendor: false, is_admin: { $ne: true } }),
      User.countDocuments({ is_vendor: true }),
      User.countDocuments({ is_vendor: false, is_deleted: false, is_admin: { $ne: true } }),
      User.countDocuments({ is_deleted: true }),
      User.countDocuments({ "subscription.active": true }),
      ArtisanRequest.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      Quotes.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      Support.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      Wallet.aggregate([
        { $group: { _id: null, balance: { $sum: "$balance" }, count: { $sum: 1 } } },
      ]),
      Transaction.aggregate([
        { $match: { createdAt: { $gte: monthStart }, status: { $ne: "failed" } } },
        { $group: { _id: "$type", amount: { $sum: "$amount" }, count: { $sum: 1 } } },
      ]),
      User.find({ is_admin: { $ne: true } })
        .select("-password -otp -resetToken")
        .sort({ createdAt: -1 })
        .limit(6),
      ArtisanRequest.find().sort({ createdAt: -1 }).limit(6),
      Support.find().sort({ createdAt: -1 }).limit(6),
      User.aggregate([
        { $match: { createdAt: { $gte: weekStart }, is_admin: { $ne: true } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            users: {
              $sum: { $cond: [{ $eq: ["$is_vendor", false] }, 1, 0] },
            },
            vendors: {
              $sum: { $cond: [{ $eq: ["$is_vendor", true] }, 1, 0] },
            },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    const monthInflow = monthTransactions
      .filter((t) => t._id === "deposit" || t._id === "reverse")
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);
    const monthOutflow = monthTransactions
      .filter((t) => t._id === "withdraw" || t._id === "debit")
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);

    const artisanStatus = {
      pending: 0,
      assigned: 0,
      in_progress: 0,
      fulfilled: 0,
      delivered: 0,
      cancelled: 0,
      ...countBy(artisanByStatus),
    };

    return res.status(200).json({
      message: "Success",
      stats: {
        users: {
          customers: totalUsers,
          vendors: totalVendors,
          activeCustomers,
          deactivated: deactivatedAccounts,
          activeSubscriptions,
        },
        artisanRequests: {
          total: Object.values(artisanStatus).reduce((a, b) => a + b, 0),
          ...artisanStatus,
        },
        quotes: pipelineCounts(quotesByStatus),
        support: {
          total: supportByStatus.reduce((sum, item) => sum + item.count, 0),
          ...countBy(supportByStatus),
        },
        finance: {
          walletBalance: walletTotals[0]?.balance || 0,
          walletCount: walletTotals[0]?.count || 0,
          monthInflow,
          monthOutflow,
        },
        signups: weekSignups,
        recentUsers,
        recentRequests,
        recentSupport,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
});

adminRouter.get("/users", async (req: Request, res: Response) => {
  try {
    const { type, status, search, subscribed } = req.query;
    const { page, limit, skip } = getPagination(req);

    const query: Record<string, any> = { is_admin: { $ne: true } };

    if (type === "vendor") query.is_vendor = true;
    else if (type === "user") query.is_vendor = false;

    if (status === "active") query.is_deleted = false;
    if (status === "deactivated") query.is_deleted = true;
    if (status === "occupied") query.is_active = true;
    if (status === "available") query.is_active = false;

    if (subscribed === "true") query["subscription.active"] = true;
    if (subscribed === "false") query["subscription.active"] = { $ne: true };

    if (req.query.vendor_type === "artisan" || req.query.vendor_type === "vendor") {
      query.vendor_type = req.query.vendor_type;
    }

    Object.assign(query, searchFilter(search as string));

    const [users, total] = await Promise.all([
      User.find(query)
        .select("-password -otp -resetToken")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      User.countDocuments(query),
    ]);

    const userIds = users.map((u) => u._id);
    const wallets = await Wallet.find({ user_id: { $in: userIds } });
    const walletMap = wallets.reduce((acc, wallet) => {
      acc[wallet.user_id.toString()] = wallet;
      return acc;
    }, {} as Record<string, any>);

    return res.status(200).json({
      message: "Success",
      users: users.map((user) => ({
        ...user.toJSON(),
        wallet: walletMap[user._id.toString()] || null,
      })),
      page,
      total,
      pages: Math.ceil(total / Math.max(limit, 1)),
    });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
});

adminRouter.get("/users/:id", async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.params.id).select("-password -otp -resetToken");
    if (!user) return res.status(404).json({ message: "User not found" });

    const { wallet, transactions, inflow, outflow } = await walletBreakdown(user._id.toString());
    const [requests, quotes, support, reviews] = await Promise.all([
      ArtisanRequest.find({
        $or: [{ user_id: user._id.toString() }, { email: user.email }],
      }).sort({ createdAt: -1 }),
      Quotes.find({
        $or: [{ "requester.id": user._id.toString() }, { "vendor.id": user._id.toString() }],
      }).sort({ createdAt: -1 }),
      Support.find({
        $or: [{ user_id: user._id.toString() }, { email: user.email }],
      }).sort({ createdAt: -1 }),
      Review.find({
        $or: [{ user: user._id }, { vendor_id: user._id.toString() }],
      })
        .populate("user", "first_name last_name picture")
        .sort({ createdAt: -1 }),
    ]);

    return res.status(200).json({
      message: "Success",
      user,
      wallet,
      finance: { inflow, outflow, balance: wallet?.balance || 0 },
      transactions,
      requests,
      quotes,
      support,
      reviews,
    });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
});

adminRouter.post("/users", async (req: Request, res: Response) => {
  const { first_name, last_name, email, password, phone_number, is_vendor } = req.body;

  if (!first_name || !last_name || !email || !password || !phone_number) {
    return res.status(400).json({
      message: "first_name, last_name, email, phone_number and password are required",
    });
  }

  if (!isValidNigerianPhone(phone_number)) {
    return res.status(400).json({ message: "Enter a valid Nigerian phone number" });
  }

  try {
    const normalizedEmail = normalizeEmail(email);
    const existing = await User.findOne(emailMatch(normalizedEmail));
    if (existing) {
      return res.status(400).json({ message: "A user with this email already exists" });
    }

    const user = await User.create({
      first_name,
      last_name,
      email: normalizedEmail,
      phone_number: normalizePhone(phone_number),
      password: bcryptjs.hashSync(password, saltRounds),
      is_vendor: Boolean(is_vendor),
      is_deleted: false,
      is_active: false,
      is_verified: false,
    });

    applyUserUpdates(user, req.body);
    user.email = normalizedEmail;
    user.phone_number = normalizePhone(phone_number);
    await user.save();

    await Wallet.create({
      user_id: user._id,
      currency_code: "NGN",
      balance: 0,
      is_active: true,
    });

    return res.status(201).json({ message: "Account created", user });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
});

adminRouter.put("/users/:id", async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    applyUserUpdates(user, req.body);

    if (req.body.password) {
      user.password = bcryptjs.hashSync(req.body.password, saltRounds);
    }

    if (req.body.subscription) {
      user.subscription = {
        ...user.subscription,
        ...req.body.subscription,
      };
    }

    await user.save();
    return res.status(200).json({ message: "User updated", user });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
});

adminRouter.put("/users/:id/status", async (req: Request, res: Response) => {
  const { is_deleted, is_verified, is_recommended, is_active } = req.body;

  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (typeof is_deleted === "boolean") user.is_deleted = is_deleted;
    if (typeof is_verified === "boolean") user.is_verified = is_verified;
    if (typeof is_recommended === "boolean") user.is_recommended = is_recommended;
    if (typeof is_active === "boolean") user.is_active = is_active;

    await user.save();
    return res.status(200).json({
      message: user.is_deleted ? "Account deactivated" : "Account updated",
      user,
    });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
});

adminRouter.delete("/users/:id", async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.is_deleted = true;
    await user.save();
    return res.status(200).json({ message: "Account deactivated", user });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
});

adminRouter.get("/subscriptions", async (req: Request, res: Response) => {
  try {
    const { search, active, type } = req.query;
    const { page, limit, skip } = getPagination(req);
    const query: Record<string, any> = { is_admin: { $ne: true } };

    if (type === "vendor") query.is_vendor = true;
    if (type === "user") query.is_vendor = false;
    if (active === "true") query["subscription.active"] = true;
    if (active === "false") query["subscription.active"] = { $ne: true };
    Object.assign(query, searchFilter(search as string));

    const [users, total, planBreakdown] = await Promise.all([
      User.find(query)
        .select("first_name last_name email phone_number is_vendor subscription last_login createdAt picture is_deleted")
        .sort({ "subscription.renewed_at": -1, createdAt: -1 })
        .skip(skip)
        .limit(limit),
      User.countDocuments(query),
      User.aggregate([
        { $match: { is_admin: { $ne: true } } },
        {
          $group: {
            _id: {
              $cond: [
                { $eq: ["$subscription.active", true] },
                { $ifNull: ["$subscription.plan_name", "Active"] },
                "Inactive",
              ],
            },
            count: { $sum: 1 },
            revenue: { $sum: "$subscription.amount" },
          },
        },
      ]),
    ]);

    return res.status(200).json({
      message: "Success",
      subscriptions: users,
      plans: planBreakdown,
      page,
      total,
      pages: Math.ceil(total / Math.max(limit, 1)),
    });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
});

adminRouter.put("/subscriptions/:userId", async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const { plan_name, amount, active, start_date, renewed_at } = req.body;
    user.subscription = {
      plan_name: plan_name ?? user.subscription?.plan_name ?? null,
      amount: amount ?? user.subscription?.amount ?? 0,
      reference: user.subscription?.reference ?? null,
      active: typeof active === "boolean" ? active : user.subscription?.active ?? false,
      start_date: start_date ? new Date(start_date) : user.subscription?.start_date ?? null,
      renewed_at: renewed_at ? new Date(renewed_at) : new Date(),
    };

    if (user.subscription.active) {
      user.is_recommended = true;
    }

    await user.save();
    return res.status(200).json({ message: "Subscription updated", user });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
});

adminRouter.get("/artisan-requests", async (req: Request, res: Response) => {
  try {
    const { status, search } = req.query;
    const { page, limit, skip } = getPagination(req);
    const query: Record<string, any> = {};

    if (status) query.status = status;
    if (search) {
      const regex = new RegExp(escapeRegex(String(search)), "i");
      query.$or = [
        { name: regex },
        { email: regex },
        { phone: regex },
        { title: regex },
        { address: regex },
        { area: regex },
        { problem: regex },
      ];
    }

    const [requests, total, byStatus] = await Promise.all([
      ArtisanRequest.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
      ArtisanRequest.countDocuments(query),
      ArtisanRequest.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
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
      counts: countBy(byStatus),
      page,
      total,
      pages: Math.ceil(total / Math.max(limit, 1)),
    });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
});

adminRouter.get("/artisan-requests/:id", async (req: Request, res: Response) => {
  try {
    const request = await ArtisanRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: "Request not found" });

    const bids = await ArtisanRequestBid.find({
      artisan_request_id: request._id.toString(),
    }).sort({ createdAt: -1 });

    let linkedQuote = null;
    if (request.quote_id) {
      linkedQuote = await Quotes.findById(request.quote_id);
    }

    let skill = null;
    if (request.skill_id) {
      skill = await Skill.findById(request.skill_id).select("title description");
    }

    return res.status(200).json({
      message: "Success",
      request,
      bids,
      linkedQuote,
      skill,
    });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
});

adminRouter.put("/artisan-requests/:id", async (req: Request, res: Response) => {
  try {
    const request = await ArtisanRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: "Request not found" });

    const previousStatus = request.status;
    const { status, admin_notes, title, problem, address } = req.body;
    if (status) {
      if (!(ARTISAN_REQUEST_STATUSES as readonly string[]).includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }
      request.status = status;
    }
    if (admin_notes !== undefined) request.admin_notes = admin_notes;
    if (title !== undefined) request.title = title;
    if (problem !== undefined) request.problem = problem;
    if (address !== undefined) request.address = address;

    await request.save();

    if (status && status !== previousStatus) {
      notifyArtisanRequestProgress(request).catch((error) => {
        console.error("Unable to notify customer about artisan request update:", error);
      });
    }

    return res.status(200).json({ message: "Request updated", request });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
});

adminRouter.delete("/artisan-requests/:id", async (req: Request, res: Response) => {
  try {
    const request = await ArtisanRequest.findByIdAndDelete(req.params.id);
    if (!request) return res.status(404).json({ message: "Request not found" });
    return res.status(200).json({ message: "Request deleted" });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
});

adminRouter.get("/quotes", async (req: Request, res: Response) => {
  try {
    const { status, search } = req.query;
    const { page, limit, skip } = getPagination(req);
    const query: Record<string, any> = {};

    Object.assign(query, quoteStatusQuery(status as string));
    if (search) {
      const regex = new RegExp(escapeRegex(String(search)), "i");
      query.$or = [
        { title: regex },
        { description: regex },
        { "requester.name": regex },
        { "vendor.name": regex },
      ];
    }

    const [quotes, total, byStatus] = await Promise.all([
      Quotes.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Quotes.countDocuments(query),
      Quotes.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    ]);

    return res.status(200).json({
      message: "Success",
      quotes,
      counts: pipelineCounts(byStatus),
      page,
      total,
      pages: Math.ceil(total / Math.max(limit, 1)),
    });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
});

adminRouter.put("/quotes/:id", async (req: Request, res: Response) => {
  try {
    const quote = await Quotes.findById(req.params.id);
    if (!quote) return res.status(404).json({ message: "Quote not found" });

    const { status, amount, vendor_comment } = req.body;
    if (status) quote.status = toQuoteWorkflowStatus(status);
    if (amount !== undefined) quote.amount = amount;
    if (vendor_comment !== undefined) quote.vendor_comment = vendor_comment;

    await quote.save();
    return res.status(200).json({ message: "Quote updated", quote });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
});

adminRouter.get("/support", async (req: Request, res: Response) => {
  try {
    const { status, search } = req.query;
    const { page, limit, skip } = getPagination(req);
    const query: Record<string, any> = {};

    if (status) query.status = status;
    if (search) {
      const regex = new RegExp(escapeRegex(String(search)), "i");
      query.$or = [{ email: regex }, { title: regex }, { message: regex }];
    }

    const [tickets, total, byStatus] = await Promise.all([
      Support.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Support.countDocuments(query),
      Support.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    ]);

    return res.status(200).json({
      message: "Success",
      tickets,
      counts: countBy(byStatus),
      page,
      total,
      pages: Math.ceil(total / Math.max(limit, 1)),
    });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
});

adminRouter.put("/support/:id", async (req: Request, res: Response) => {
  try {
    const ticket = await Support.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: "Support ticket not found" });

    const { status, admin_notes } = req.body;
    if (status) {
      if (!(SUPPORT_STATUSES as readonly string[]).includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }
      ticket.status = status;
    }
    if (admin_notes !== undefined) ticket.admin_notes = admin_notes;

    await ticket.save();
    return res.status(200).json({ message: "Support ticket updated", ticket });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
});

adminRouter.delete("/support/:id", async (req: Request, res: Response) => {
  try {
    const ticket = await Support.findByIdAndDelete(req.params.id);
    if (!ticket) return res.status(404).json({ message: "Support ticket not found" });
    return res.status(200).json({ message: "Support ticket deleted" });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
});

adminRouter.get("/wallets", async (req: Request, res: Response) => {
  try {
    const { search, status } = req.query;
    const { page, limit, skip } = getPagination(req);

    const match: Record<string, any> = {};
    if (status === "active") match.is_active = true;
    if (status === "frozen") match.is_active = false;

    const pipeline: any[] = [
      { $match: match },
      {
        $lookup: {
          from: "users",
          localField: "user_id",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
    ];

    if (search) {
      const regex = new RegExp(escapeRegex(String(search)), "i");
      pipeline.push({
        $match: {
          $or: [
            { "user.first_name": regex },
            { "user.last_name": regex },
            { "user.email": regex },
            { "user.phone_number": regex },
          ],
        },
      });
    }

    pipeline.push(
      {
        $lookup: {
          from: "transactions",
          localField: "user_id",
          foreignField: "user_id",
          as: "transactions",
        },
      },
      {
        $addFields: {
          inflow: {
            $sum: {
              $map: {
                input: {
                  $filter: {
                    input: "$transactions",
                    as: "t",
                    cond: {
                      $and: [
                        { $in: ["$$t.type", ["deposit", "reverse"]] },
                        { $ne: ["$$t.status", "failed"] },
                      ],
                    },
                  },
                },
                as: "t",
                in: "$$t.amount",
              },
            },
          },
          outflow: {
            $sum: {
              $map: {
                input: {
                  $filter: {
                    input: "$transactions",
                    as: "t",
                    cond: {
                      $and: [
                        { $in: ["$$t.type", ["withdraw", "debit"]] },
                        { $ne: ["$$t.status", "failed"] },
                      ],
                    },
                  },
                },
                as: "t",
                in: "$$t.amount",
              },
            },
          },
        },
      },
      {
        $project: {
          transactions: 0,
          "user.password": 0,
          "user.otp": 0,
          "user.resetToken": 0,
        },
      },
      { $sort: { updatedAt: -1 } }
    );

    const [result] = await Wallet.aggregate([
      ...pipeline,
      {
        $facet: {
          items: [{ $skip: skip }, { $limit: limit }],
          total: [{ $count: "count" }],
          totals: [
            {
              $group: {
                _id: null,
                balance: { $sum: "$balance" },
                inflow: { $sum: "$inflow" },
                outflow: { $sum: "$outflow" },
              },
            },
          ],
        },
      },
    ]);

    const total = result.total[0]?.count || 0;

    return res.status(200).json({
      message: "Success",
      wallets: result.items,
      totals: result.totals[0] || { balance: 0, inflow: 0, outflow: 0 },
      page,
      total,
      pages: Math.ceil(total / Math.max(limit, 1)),
    });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
});

adminRouter.get("/wallets/:userId", async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.params.userId).select("-password -otp -resetToken");
    if (!user) return res.status(404).json({ message: "User not found" });

    const { wallet, transactions, inflow, outflow } = await walletBreakdown(user._id.toString());
    return res.status(200).json({
      message: "Success",
      user,
      wallet,
      finance: { inflow, outflow, balance: wallet?.balance || 0 },
      transactions,
    });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
});

adminRouter.put("/wallets/:userId", async (req: Request, res: Response) => {
  try {
    const wallet = await Wallet.findOne({ user_id: req.params.userId });
    if (!wallet) return res.status(404).json({ message: "Wallet not found" });

    const admin = (req as any).user;
    const previousActive = wallet.is_active;

    if (typeof req.body.is_active === "boolean") {
      wallet.is_active = req.body.is_active;
    }

    await wallet.save();

    if (typeof req.body.is_active === "boolean" && previousActive !== wallet.is_active) {
      await writeAuditLog({
        action: wallet.is_active ? "wallet_unfrozen" : "wallet_frozen",
        adminId: admin._id.toString(),
        targetUserId: req.params.userId,
        details: {
          previous_is_active: previousActive,
          is_active: wallet.is_active,
          reason: req.body.reason || null,
        },
      });
    }

    return res.status(200).json({ message: "Wallet updated", wallet });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
});

adminRouter.post("/wallets/:userId/adjust", async (req: Request, res: Response) => {
  const { type, amount, description, reason } = req.body;

  if (!["deposit", "debit", "withdraw", "reverse"].includes(type)) {
    return res.status(400).json({ message: "Invalid transaction type" });
  }

  try {
    const admin = (req as any).user;
    const parsedAmount = parseFloat(amount);
    const transaction = await processTransaction({
      user_id: req.params.userId,
      type,
      amount: parsedAmount,
      description: description || `Admin ${type}`,
    });

    await writeAuditLog({
      action: "wallet_adjust",
      adminId: admin._id.toString(),
      targetUserId: req.params.userId,
      details: {
        type,
        amount: parsedAmount,
        description: description || `Admin ${type}`,
        reason: reason || null,
        transaction_id: transaction._id.toString(),
      },
    });

    return res.status(201).json({ message: "Wallet adjusted", transaction });
  } catch (error: any) {
    return res.status(400).json({ message: error.message });
  }
});

adminRouter.post("/quotes/:id/refund-escrow", async (req: Request, res: Response) => {
  const { reason } = req.body;

  try {
    const admin = (req as any).user;
    const quote = await Quotes.findById(req.params.id);
    if (!quote) return res.status(404).json({ message: "Quote not found" });

    if (!["accepted", "in_progress", "completed"].includes(quote.status)) {
      return res.status(400).json({
        message: "Escrow can only be refunded for accepted, in-progress, or completed quotes",
      });
    }

    const quoteAmount = parseFloat(quote.amount?.toString() || "0");
    if (quoteAmount <= 0) {
      return res.status(400).json({ message: "Quote has no escrow amount to refund" });
    }

    const refund = await refundQuoteEscrow(req.params.id, quote.requester.id, quoteAmount);

    quote.status = "cancelled";
    await quote.save();

    const vendor = await User.findById(quote.vendor.id);
    if (vendor) {
      vendor.is_active = false;
      await vendor.save();
    }

    await writeAuditLog({
      action: "quote_escrow_refund",
      adminId: admin._id.toString(),
      targetUserId: quote.requester.id,
      details: {
        quote_id: quote._id.toString(),
        amount: quoteAmount,
        reason: reason || null,
        refund_transaction_id: refund._id.toString(),
      },
    });

    return res.status(200).json({
      message: "Escrow refunded successfully",
      quote,
      refund,
    });
  } catch (error: any) {
    return res.status(400).json({ message: error.message });
  }
});

adminRouter.get("/transactions", async (req: Request, res: Response) => {
  try {
    const { type, status, search } = req.query;
    const { page, limit, skip } = getPagination(req);
    const query: Record<string, any> = {};

    if (type) query.type = type;
    if (status) query.status = status;

    if (search) {
      const regex = new RegExp(escapeRegex(String(search)), "i");
      const matchedUsers = await User.find({
        $or: [{ first_name: regex }, { last_name: regex }, { email: regex }],
      }).select("_id");
      query.$or = [
        { description: regex },
        { reference: regex },
        { user_id: { $in: matchedUsers.map((u) => u._id) } },
      ];
    }

    const [transactions, total] = await Promise.all([
      Transaction.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Transaction.countDocuments(query),
    ]);

    const userIds = [...new Set(transactions.map((t) => t.user_id?.toString()).filter(Boolean))];
    const users = await User.find({
      _id: { $in: userIds.map((id) => new mongoose.Types.ObjectId(id)) },
    }).select("first_name last_name email picture is_vendor");

    const userMap = users.reduce((acc, user) => {
      acc[user._id.toString()] = user;
      return acc;
    }, {} as Record<string, any>);

    return res.status(200).json({
      message: "Success",
      transactions: transactions.map((t) => ({
        ...t.toObject(),
        user: userMap[t.user_id?.toString()] || null,
      })),
      page,
      total,
      pages: Math.ceil(total / Math.max(limit, 1)),
    });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
});

adminRouter.get("/reviews", async (req: Request, res: Response) => {
  try {
    const { search } = req.query;
    const { page, limit, skip } = getPagination(req);
    const query: Record<string, any> = {};

    if (search) {
      query.review = new RegExp(escapeRegex(String(search)), "i");
    }

    const [reviews, total] = await Promise.all([
      Review.find(query)
        .populate("user", "first_name last_name picture email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Review.countDocuments(query),
    ]);

    const vendorIds = [...new Set(reviews.map((r) => r.vendor_id).filter(Boolean))];
    const vendors = await User.find({ _id: { $in: vendorIds } }).select(
      "first_name last_name email picture"
    );
    const vendorMap = vendors.reduce((acc, vendor) => {
      acc[vendor._id.toString()] = vendor;
      return acc;
    }, {} as Record<string, any>);

    return res.status(200).json({
      message: "Success",
      reviews: reviews.map((review) => ({
        ...review.toObject(),
        vendor: vendorMap[review.vendor_id] || null,
      })),
      page,
      total,
      pages: Math.ceil(total / Math.max(limit, 1)),
    });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
});

adminRouter.delete("/reviews/:id", async (req: Request, res: Response) => {
  try {
    const review = await Review.findByIdAndDelete(req.params.id);
    if (!review) return res.status(404).json({ message: "Review not found" });
    return res.status(200).json({ message: "Review deleted" });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
});

adminRouter.get("/catalog", async (_req: Request, res: Response) => {
  try {
    const [categories, skills] = await Promise.all([
      Category.find().populate({ path: "skills", select: "title description" }),
      Skill.find(),
    ]);

    return res.status(200).json({ message: "Success", categories, skills });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
});

adminRouter.get("/audit-logs", async (req: Request, res: Response) => {
  try {
    const { action, search } = req.query;
    const { page, limit, skip } = getPagination(req);
    const query: Record<string, any> = {};

    if (action) query.action = action;

    if (search) {
      const regex = new RegExp(escapeRegex(String(search)), "i");
      const matchedUsers = await User.find({
        $or: [{ first_name: regex }, { last_name: regex }, { email: regex }],
      }).select("_id");
      query.$or = [
        { action: regex },
        { admin_id: { $in: matchedUsers.map((u) => u._id) } },
        { target_user_id: { $in: matchedUsers.map((u) => u._id) } },
      ];
    }

    const [logs, total] = await Promise.all([
      AuditLog.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
      AuditLog.countDocuments(query),
    ]);

    const userIds = [
      ...new Set(
        logs
          .flatMap((log) => [log.admin_id?.toString(), log.target_user_id?.toString()])
          .filter(Boolean)
      ),
    ];

    const users = await User.find({
      _id: { $in: userIds.map((id) => new mongoose.Types.ObjectId(id)) },
    }).select("first_name last_name email");

    const userMap = users.reduce((acc, user) => {
      acc[user._id.toString()] = user;
      return acc;
    }, {} as Record<string, any>);

    return res.status(200).json({
      message: "Success",
      logs: logs.map((log) => ({
        ...log.toObject(),
        admin: log.admin_id ? userMap[log.admin_id.toString()] || null : null,
        target_user: log.target_user_id ? userMap[log.target_user_id.toString()] || null : null,
      })),
      page,
      total,
      pages: Math.ceil(total / Math.max(limit, 1)),
    });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
});

export default adminRouter;
