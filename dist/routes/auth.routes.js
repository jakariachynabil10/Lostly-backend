"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const auth_controller_1 = require("../controllers/auth.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const validate_middleware_1 = require("../middleware/validate.middleware");
const auth_validator_1 = require("../validators/auth.validator");
const router = (0, express_1.Router)();
const authLimiter = (0, express_rate_limit_1.default)({
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
router.post("/register", authLimiter, (0, validate_middleware_1.validateRequest)(auth_validator_1.registerSchema), auth_controller_1.AuthController.register);
router.post("/login", authLimiter, (0, validate_middleware_1.validateRequest)(auth_validator_1.loginSchema), auth_controller_1.AuthController.login);
router.post("/refresh", (0, validate_middleware_1.validateRequest)(auth_validator_1.refreshTokenSchema), auth_controller_1.AuthController.refresh);
router.post("/logout", auth_controller_1.AuthController.logout);
router.get("/me", auth_middleware_1.authMiddleware, auth_controller_1.AuthController.me);
router.put("/profile", auth_middleware_1.authMiddleware, (0, validate_middleware_1.validateRequest)(auth_validator_1.updateProfileSchema), auth_controller_1.AuthController.updateProfile);
exports.default = router;
