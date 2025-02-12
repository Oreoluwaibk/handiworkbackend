import { Router } from "express";
import authRouter from "./auth";
import categoryRouter from "./category";
import skillRouter from "./skill";
import supportRouter from "./support";
import notificationRouter from "./notification";
import userRouter from "./user";
import vendorRouter from "./vendorflow";

const router = Router();

router.use("/auth", authRouter);
router.use("/category", categoryRouter);
router.use("/skill", skillRouter);
router.use("/support", supportRouter);
router.use("/notification", notificationRouter);
router.use("/user", userRouter);
router.use("/vendor", vendorRouter);

export default router;