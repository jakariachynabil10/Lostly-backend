import { z } from "zod";

export const addQuestionsSchema = z.object({
  claimId: z.string().trim().min(1).max(100),
  questions: z.array(z.string().trim().min(3).max(500)).min(1).max(5),
});

export const submitAnswersSchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.string().trim().min(1).max(100),
        answer: z.string().trim().min(1).max(2000),
      }),
    )
    .min(1)
    .max(100),
});

export const reviewAnswerSchema = z.object({
  reviewStatus: z.enum(["ACCEPTED", "REJECTED"]),
});

export const answerIdParamSchema = z.object({
  id: z.string().trim().min(1).max(100),
});
