import { Router } from "express";
import rateLimit from "express-rate-limit";
import { AuthController } from "../controllers/auth.controller";
import { authMiddleware } from "../middleware/auth.middleware";
import { validateRequest } from "../middleware/validate.middleware";
import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  updateProfileSchema,
} from "../validators/auth.validator";

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 requests per window
  message: {
    success: false,
    message: "Too many authentication attempts, please try again in 15 minutes",
    errors: [],
  },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post(
  "/register",
  authLimiter,
  validateRequest(registerSchema),
  AuthController.register,
);

router.post(
  "/login",
  authLimiter,
  validateRequest(loginSchema),
  AuthController.login,
);

router.post(
  "/refresh",
  validateRequest(refreshTokenSchema),
  AuthController.refresh,
);

router.post("/logout", AuthController.logout);

router.get("/me", authMiddleware, AuthController.me);

router.put(
  "/profile",
  authMiddleware,
  validateRequest(updateProfileSchema),
  AuthController.updateProfile,
);

export default router;
