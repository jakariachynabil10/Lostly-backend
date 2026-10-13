import { Router } from "express";
import { MatchController } from "../controllers/match.controller";
import { authMiddleware, optionalAuthMiddleware } from "../middleware/auth.middleware";

const router = Router();

// Get matches for the current user across all items
router.get("/my", authMiddleware, MatchController.getMyMatches);

// Get matches for a specific report
router.get("/report/:reportId", optionalAuthMiddleware, MatchController.getMatchesForReport);

// Trigger re-matching for a report
router.post("/report/:reportId/trigger", authMiddleware, MatchController.triggerMatching);

export default router;
