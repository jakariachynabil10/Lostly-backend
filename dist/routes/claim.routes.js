"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_rate_limit_1 = require("express-rate-limit");
const claim_controller_1 = require("../controllers/claim.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const validate_middleware_1 = require("../middleware/validate.middleware");
const claim_validator_1 = require("../validators/claim.validator");
const router = (0, express_1.Router)();
const claimCreationLimiter = (0, express_rate_limit_1.rateLimit)({
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
router.use(auth_middleware_1.authMiddleware);
router.post("/", claimCreationLimiter, (0, validate_middleware_1.validateRequest)(claim_validator_1.createClaimSchema), claim_controller_1.ClaimController.create);
router.get("/", (0, validate_middleware_1.validateRequest)(claim_validator_1.getClaimsQuerySchema, "query"), claim_controller_1.ClaimController.list);
router.get("/:id", (0, validate_middleware_1.validateRequest)(claim_validator_1.claimIdParamSchema, "params"), claim_controller_1.ClaimController.getById);
router.patch("/:id", (0, validate_middleware_1.validateRequest)(claim_validator_1.claimIdParamSchema, "params"), (0, validate_middleware_1.validateRequest)(claim_validator_1.claimActionSchema), claim_controller_1.ClaimController.update);
exports.default = router;
