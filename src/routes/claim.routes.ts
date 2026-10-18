import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { ClaimController } from "../controllers/claim.controller";
import { authMiddleware } from "../middleware/auth.middleware";
import { validateRequest } from "../middleware/validate.middleware";
import {
  claimActionSchema,
  claimIdParamSchema,
  createClaimSchema,
  getClaimsQuerySchema,
} from "../validators/claim.validator";

const router = Router();
const claimCreationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      message: "Too many claim creation attempts. Please try again later.",
      errors: [],
    });
  },
});

router.use(authMiddleware);

router.post(
  "/",
  claimCreationLimiter,
  validateRequest(createClaimSchema),
  ClaimController.create,
);
router.get(
  "/",
  validateRequest(getClaimsQuerySchema, "query"),
  ClaimController.list,
);
router.get(
  "/:id",
  validateRequest(claimIdParamSchema, "params"),
  ClaimController.getById,
);
router.patch(
  "/:id",
  validateRequest(claimIdParamSchema, "params"),
  validateRequest(claimActionSchema),
  ClaimController.update,
);

export default router;
