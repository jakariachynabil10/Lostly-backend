"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_rate_limit_1 = require("express-rate-limit");
const verification_controller_1 = require("../controllers/verification.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const validate_middleware_1 = require("../middleware/validate.middleware");
const verification_validator_1 = require("../validators/verification.validator");
const router = (0, express_1.Router)();
const answerSubmissionLimiter = (0, express_rate_limit_1.rateLimit)({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: (_req, res) => {
        res.status(429).json({
            success: false,
            message: "Too many answer submissions. Please try again later.",
            errors: [],
        });
    },
});
router.use(auth_middleware_1.authMiddleware);
router.post("/questions", (0, validate_middleware_1.validateRequest)(verification_validator_1.addQuestionsSchema), verification_controller_1.VerificationController.addQuestions);
router.post("/answers", answerSubmissionLimiter, (0, validate_middleware_1.validateRequest)(verification_validator_1.submitAnswersSchema), verification_controller_1.VerificationController.submitAnswers);
router.patch("/answers/:id", (0, validate_middleware_1.validateRequest)(verification_validator_1.answerIdParamSchema, "params"), (0, validate_middleware_1.validateRequest)(verification_validator_1.reviewAnswerSchema), verification_controller_1.VerificationController.reviewAnswer);
exports.default = router;
