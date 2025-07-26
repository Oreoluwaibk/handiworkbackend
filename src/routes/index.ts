import { Router } from "express";
import authRouter from "./auth";
import categoryRouter from "./category";
import skillRouter from "./skill";
import supportRouter from "./support";
import notificationRouter from "./notification";
import userRouter from "./user";
import vendorRouter from "./vendorflow";
import quoteRouter from "./quote";
import reviewRouter from "./review";
import messageRouter from "./message"
import uploadRouter from "./upload";
import walletRouter from "./wallet";
import transactionRouter from "./transactions";

const router = Router();

router.use("/auth", authRouter);
router.use("/category", categoryRouter);
router.use("/skill", skillRouter);
router.use("/support", supportRouter);
router.use("/notification", notificationRouter);
router.use("/user", userRouter);
router.use("/vendor", vendorRouter);
router.use("/quotes", quoteRouter);
router.use("/reviews", reviewRouter);
router.use("/messages", messageRouter);
router.use('/upload', uploadRouter);
router.use('/wallet', walletRouter);
router.use('/transactions', transactionRouter);

export default router;