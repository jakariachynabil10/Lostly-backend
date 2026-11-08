"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const report_controller_1 = require("../controllers/report.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const validate_middleware_1 = require("../middleware/validate.middleware");
const upload_middleware_1 = require("../middleware/upload.middleware");
const report_validator_1 = require("../validators/report.validator");
const router = (0, express_1.Router)();
// Upload image (requires auth)
router.post("/upload", auth_middleware_1.authMiddleware, upload_middleware_1.upload.single("image"), report_controller_1.ReportController.uploadImage);
// Get current user's reports (requires auth)
router.get("/my", auth_middleware_1.authMiddleware, report_controller_1.ReportController.getMyReports);
// Get all reports with filters (public / optional auth)
router.get("/", auth_middleware_1.optionalAuthMiddleware, report_controller_1.ReportController.getAll);
// Get single report by ID (public / optional auth)
router.get("/:id", auth_middleware_1.optionalAuthMiddleware, report_controller_1.ReportController.getById);
// Create report (requires auth)
router.post("/", auth_middleware_1.authMiddleware, (0, validate_middleware_1.validateRequest)(report_validator_1.createReportSchema), report_controller_1.ReportController.create);
// Update report (requires auth, owner checked in service)
router.put("/:id", auth_middleware_1.authMiddleware, (0, validate_middleware_1.validateRequest)(report_validator_1.updateReportSchema), report_controller_1.ReportController.update);
// Delete report (requires auth, owner checked in service)
router.delete("/:id", auth_middleware_1.authMiddleware, report_controller_1.ReportController.delete);
exports.default = router;
