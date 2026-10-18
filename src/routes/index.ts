import { Router } from "express";
import authRoutes from "./auth.routes";
import categoryRoutes from "./category.routes";
import reportRoutes from "./report.routes";
import matchRoutes from "./match.routes";
import dashboardRoutes from "./dashboard.routes";
import notificationRoutes from "./notification.routes";
import claimRoutes from "./claim.routes";
import verificationRoutes from "./verification.routes";

const router = Router();

router.use("/auth", authRoutes);
router.use("/categories", categoryRoutes);
router.use("/reports", reportRoutes);
router.use("/matches", matchRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/notifications", notificationRoutes);
router.use("/claims", claimRoutes);
router.use("/verification", verificationRoutes);

export default router;
