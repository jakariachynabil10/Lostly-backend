import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { VerificationController } from "../controllers/verification.controller";
import { authMiddleware } from "../middleware/auth.middleware";
import { validateRequest } from "../middleware/validate.middleware";
import {
  addQuestionsSchema,
  answerIdParamSchema,
  reviewAnswerSchema,
  submitAnswersSchema,
} from "../validators/verification.validator";

const router = Router();
const answerSubmissionLimiter = rateLimit({
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

router.use(authMiddleware);

router.post(
  "/questions",
  validateRequest(addQuestionsSchema),
  VerificationController.addQuestions,
);
router.post(
  "/answers",
  answerSubmissionLimiter,
  validateRequest(submitAnswersSchema),
  VerificationController.submitAnswers,
);
router.patch(
  "/answers/:id",
  validateRequest(answerIdParamSchema, "params"),
  validateRequest(reviewAnswerSchema),
  VerificationController.reviewAnswer,
);

export default router;
