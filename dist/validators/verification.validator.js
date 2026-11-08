"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.answerIdParamSchema = exports.reviewAnswerSchema = exports.submitAnswersSchema = exports.addQuestionsSchema = void 0;
const zod_1 = require("zod");
exports.addQuestionsSchema = zod_1.z.object({
    claimId: zod_1.z.string().trim().min(1).max(100),
    questions: zod_1.z.array(zod_1.z.string().trim().min(3).max(500)).min(1).max(5),
});
exports.submitAnswersSchema = zod_1.z.object({
    answers: zod_1.z
        .array(zod_1.z.object({
        questionId: zod_1.z.string().trim().min(1).max(100),
        answer: zod_1.z.string().trim().min(1).max(2000),
    }))
        .min(1)
        .max(100),
});
exports.reviewAnswerSchema = zod_1.z.object({
    reviewStatus: zod_1.z.enum(["ACCEPTED", "REJECTED"]),
});
exports.answerIdParamSchema = zod_1.z.object({
    id: zod_1.z.string().trim().min(1).max(100),
});
