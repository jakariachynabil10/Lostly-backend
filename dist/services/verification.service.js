"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VerificationService = void 0;
const client_1 = require("@prisma/client");
const prisma_1 = require("../prisma");
const notification_service_1 = require("./notification.service");
const MAX_QUESTION_LENGTH = 500;
const MAX_ANSWER_LENGTH = 2000;
function createError(message, statusCode) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}
function sanitizeText(value) {
    return value
        .replace(/<[^>]*>/g, " ")
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}
async function notifySafely(params) {
    try {
        await notification_service_1.NotificationService.createNotification(params);
    }
    catch (error) {
        console.warn("[VerificationService] Notification dispatch failed:", error);
    }
}
class VerificationService {
    static async addQuestions(finderId, claimId, questions) {
        const normalizedQuestions = questions.map(sanitizeText);
        if (normalizedQuestions.length < 1 ||
            normalizedQuestions.length > 5 ||
            normalizedQuestions.some((question) => question.length < 3 || question.length > MAX_QUESTION_LENGTH)) {
            throw createError("Questions must contain 3 to 500 characters, with 1 to 5 questions per request.", 400);
        }
        const result = await prisma_1.prisma.$transaction(async (tx) => {
            const claim = await tx.claim.findUnique({ where: { id: claimId } });
            if (!claim)
                throw createError("Claim not found", 404);
            if (claim.finderId !== finderId) {
                throw createError("Only the finder can add verification questions", 403);
            }
            if (claim.status !== client_1.ClaimStatus.PENDING &&
                claim.status !== client_1.ClaimStatus.UNDER_REVIEW) {
                throw createError("Questions can only be added to PENDING or UNDER_REVIEW claims", 400);
            }
            const existingQuestionCount = await tx.verificationQuestion.count({
                where: { claimId },
            });
            if (existingQuestionCount + normalizedQuestions.length > 15) {
                throw createError("A claim cannot have more than 15 verification questions", 400);
            }
            const createdQuestions = await Promise.all(normalizedQuestions.map((question) => tx.verificationQuestion.create({ data: { claimId, question } })));
            const wasUnderReview = claim.status === client_1.ClaimStatus.UNDER_REVIEW;
            if (wasUnderReview) {
                await tx.claim.update({
                    where: { id: claimId },
                    data: { status: client_1.ClaimStatus.PENDING },
                });
            }
            return { createdQuestions, wasUnderReview, claimantId: claim.claimantId };
        });
        await notifySafely({
            userId: result.claimantId,
            type: result.wasUnderReview
                ? client_1.NotificationType.MORE_INFO_REQUESTED
                : client_1.NotificationType.QUESTIONS_ADDED,
            title: result.wasUnderReview
                ? "More Information Requested"
                : "Verification Questions Added",
            message: result.wasUnderReview
                ? "The finder has requested additional verification information for your claim."
                : "The finder added verification questions to your claim.",
            link: `/claims/${claimId}`,
        });
        return result.createdQuestions;
    }
    static async submitAnswers(claimantId, answers) {
        const normalizedAnswers = answers.map((entry) => ({
            questionId: entry.questionId,
            answer: sanitizeText(entry.answer),
        }));
        if (normalizedAnswers.length === 0 ||
            normalizedAnswers.some(({ answer }) => answer.length < 1 || answer.length > MAX_ANSWER_LENGTH) ||
            new Set(normalizedAnswers.map(({ questionId }) => questionId)).size !==
                normalizedAnswers.length) {
            throw createError("Provide unique answers containing 1 to 2000 characters.", 400);
        }
        const result = await prisma_1.prisma.$transaction(async (tx) => {
            const questions = await tx.verificationQuestion.findMany({
                where: {
                    id: { in: normalizedAnswers.map(({ questionId }) => questionId) },
                },
                include: {
                    claim: true,
                    answers: {
                        select: { id: true, reviewStatus: true },
                        orderBy: { createdAt: "desc" },
                    },
                },
            });
            if (questions.length !== normalizedAnswers.length) {
                throw createError("One or more verification questions were not found", 404);
            }
            const claimId = questions[0]?.claimId;
            if (!claimId ||
                questions.some((question) => question.claimId !== claimId)) {
                throw createError("Answers must belong to the same claim", 400);
            }
            const claim = questions[0].claim;
            if (claim.claimantId !== claimantId) {
                throw createError("Only the claimant can submit verification answers", 403);
            }
            if (claim.status !== client_1.ClaimStatus.PENDING) {
                throw createError("Answers can only be submitted while the claim is PENDING", 400);
            }
            const questionsById = new Map(questions.map((question) => [question.id, question]));
            if (normalizedAnswers.some(({ questionId }) => {
                const latestAnswer = questionsById.get(questionId)?.answers[0];
                return (latestAnswer !== undefined &&
                    latestAnswer.reviewStatus !== client_1.VerificationReviewStatus.REJECTED);
            })) {
                throw createError("Only unanswered or rejected verification questions can be answered", 400);
            }
            const createdAnswers = await Promise.all(normalizedAnswers.map(({ questionId, answer }) => {
                const previousAnswer = questionsById.get(questionId)?.answers[0];
                return previousAnswer
                    ? tx.verificationAnswer.update({
                        where: { id: previousAnswer.id },
                        data: {
                            answer,
                            reviewStatus: client_1.VerificationReviewStatus.PENDING,
                        },
                    })
                    : tx.verificationAnswer.create({
                        data: { questionId, claimantId, answer },
                    });
            }));
            const allQuestions = await tx.verificationQuestion.findMany({
                where: { claimId },
                include: {
                    answers: {
                        select: { reviewStatus: true },
                        orderBy: { createdAt: "desc" },
                    },
                },
            });
            const hasOpenQuestions = allQuestions.some((question) => question.answers.length === 0 ||
                question.answers[0].reviewStatus ===
                    client_1.VerificationReviewStatus.REJECTED);
            if (!hasOpenQuestions) {
                await tx.claim.update({
                    where: { id: claimId },
                    data: { status: client_1.ClaimStatus.UNDER_REVIEW },
                });
            }
            return {
                claimId,
                finderId: claim.finderId,
                allAnswered: !hasOpenQuestions,
                createdAnswers,
            };
        });
        if (result.allAnswered) {
            await notifySafely({
                userId: result.finderId,
                type: client_1.NotificationType.ANSWERS_SUBMITTED,
                title: "Verification Answers Submitted",
                message: "The claimant has answered all verification questions. The claim is ready for review.",
                link: `/claims/${result.claimId}`,
            });
        }
        return result.createdAnswers;
    }
    static async reviewAnswer(finderId, answerId, reviewStatus) {
        const answer = await prisma_1.prisma.verificationAnswer.findUnique({
            where: { id: answerId },
            include: { question: { include: { claim: true } } },
        });
        if (!answer)
            throw createError("Verification answer not found", 404);
        if (answer.question.claim.finderId !== finderId) {
            throw createError("Only the finder can review this answer", 403);
        }
        if (answer.question.claim.status !== client_1.ClaimStatus.UNDER_REVIEW) {
            throw createError("Answers can only be reviewed while the claim is UNDER_REVIEW", 400);
        }
        return prisma_1.prisma.verificationAnswer.update({
            where: { id: answerId },
            data: { reviewStatus },
        });
    }
}
exports.VerificationService = VerificationService;
