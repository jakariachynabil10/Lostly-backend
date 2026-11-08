import { Router } from "express";
import rateLimit from "express-rate-limit";
import { AuthController } from "../controllers/auth.controller";
import { authMiddleware } from "../middleware/auth.middleware";
import { validateRequest } from "../middleware/validate.middleware";
import {
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  refreshTokenSchema,
  updateProfileSchema,
} from "../validators/auth.validator";

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: {
    success: false,
    message: "Too many authentication attempts, please try again in 15 minutes",
    errors: [],
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const verificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: {
    success: false,
    message: "Too many verification attempts, please try again later.",
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
  "/verify-email",
  verificationLimiter,
  validateRequest(verifyEmailSchema),
  AuthController.verifyEmail,
);

router.post(
  "/resend-verification",
  verificationLimiter,
  validateRequest(resendVerificationSchema),
  AuthController.resendVerification,
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
