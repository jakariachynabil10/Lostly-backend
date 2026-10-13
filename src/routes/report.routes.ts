import { Router } from "express";
import { ReportController } from "../controllers/report.controller";
import { authMiddleware, optionalAuthMiddleware } from "../middleware/auth.middleware";
import { validateRequest } from "../middleware/validate.middleware";
import { upload } from "../middleware/upload.middleware";
import { createReportSchema, updateReportSchema } from "../validators/report.validator";

const router = Router();

// Upload image (requires auth)
router.post(
  "/upload",
  authMiddleware,
  upload.single("image"),
  ReportController.uploadImage
);

// Get current user's reports (requires auth)
router.get("/my", authMiddleware, ReportController.getMyReports);

// Get all reports with filters (public / optional auth)
router.get("/", optionalAuthMiddleware, ReportController.getAll);

// Get single report by ID (public / optional auth)
router.get("/:id", optionalAuthMiddleware, ReportController.getById);

// Create report (requires auth)
router.post(
  "/",
  authMiddleware,
  validateRequest(createReportSchema),
  ReportController.create
);

// Update report (requires auth, owner checked in service)
router.put(
  "/:id",
  authMiddleware,
  validateRequest(updateReportSchema),
  ReportController.update
);

// Delete report (requires auth, owner checked in service)
router.delete("/:id", authMiddleware, ReportController.delete);

export default router;
