"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const match_controller_1 = require("../controllers/match.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
// Get matches for the current user across all items
router.get("/my", auth_middleware_1.authMiddleware, match_controller_1.MatchController.getMyMatches);
// Get matches for a specific report
router.get("/report/:reportId", auth_middleware_1.optionalAuthMiddleware, match_controller_1.MatchController.getMatchesForReport);
// Trigger re-matching for a report
router.post("/report/:reportId/trigger", auth_middleware_1.authMiddleware, match_controller_1.MatchController.triggerMatching);
exports.default = router;
