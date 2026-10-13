import { Router } from "express";
import authRoutes from "./auth.routes";
import categoryRoutes from "./category.routes";
import reportRoutes from "./report.routes";
import matchRoutes from "./match.routes";
import dashboardRoutes from "./dashboard.routes";

const router = Router();

router.use("/auth", authRoutes);
router.use("/categories", categoryRoutes);
router.use("/reports", reportRoutes);
router.use("/matches", matchRoutes);
router.use("/dashboard", dashboardRoutes);

export default router;
