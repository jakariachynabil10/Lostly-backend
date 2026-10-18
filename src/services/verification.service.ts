import {
  ClaimStatus,
  NotificationType,
  VerificationReviewStatus,
} from "@prisma/client";
import { prisma } from "../prisma";
import { AppError } from "../middleware/error.middleware";
import { NotificationService } from "./notification.service";
import { ENV } from "../config/env";

const MAX_QUESTION_LENGTH = 500;
const MAX_ANSWER_LENGTH = 2000;

function createError(message: string, statusCode: number): AppError {
  const error: AppError = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function sanitizeText(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function notifySafely(
  params: Parameters<typeof NotificationService.createNotification>[0],
) {
  try {
    await NotificationService.createNotification(params);
  } catch (error) {
    console.warn("[VerificationService] Notification dispatch failed:", error);
  }
}

function frontendLink(path: string): string {
  return new URL(path, ENV.FRONTEND_URL).toString();
}

export interface SubmitVerificationAnswer {
  questionId: string;
  answer: string;
}

export class VerificationService {
  static async addQuestions(
    finderId: string,
    claimId: string,
    questions: string[],
  ) {
    const normalizedQuestions = questions.map(sanitizeText);
    if (
      normalizedQuestions.length < 1 ||
      normalizedQuestions.length > 5 ||
      normalizedQuestions.some(
        (question) =>
          question.length < 3 || question.length > MAX_QUESTION_LENGTH,
      )
    ) {
      throw createError(
        "Questions must contain 3 to 500 characters, with 1 to 5 questions per request.",
        400,
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const claim = await tx.claim.findUnique({ where: { id: claimId } });
      if (!claim) throw createError("Claim not found", 404);
      if (claim.finderId !== finderId) {
        throw createError(
          "Only the finder can add verification questions",
          403,
        );
      }
      if (
        claim.status !== ClaimStatus.PENDING &&
        claim.status !== ClaimStatus.UNDER_REVIEW
      ) {
        throw createError(
          "Questions can only be added to PENDING or UNDER_REVIEW claims",
          400,
        );
      }

      const createdQuestions = await Promise.all(
        normalizedQuestions.map((question) =>
          tx.verificationQuestion.create({ data: { claimId, question } }),
        ),
      );

      const wasUnderReview = claim.status === ClaimStatus.UNDER_REVIEW;
      if (wasUnderReview) {
        await tx.claim.update({
          where: { id: claimId },
          data: { status: ClaimStatus.PENDING },
        });
      }

      return { createdQuestions, wasUnderReview, claimantId: claim.claimantId };
    });

    await notifySafely({
      userId: result.claimantId,
      type: result.wasUnderReview
        ? NotificationType.MORE_INFO_REQUESTED
        : NotificationType.QUESTIONS_ADDED,
      title: result.wasUnderReview
        ? "More Information Requested"
        : "Verification Questions Added",
      message: result.wasUnderReview
        ? "The finder has requested additional verification information for your claim."
        : "The finder added verification questions to your claim.",
      link: frontendLink(`/claims/${claimId}`),
    });

    return result.createdQuestions;
  }

  static async submitAnswers(
    claimantId: string,
    answers: SubmitVerificationAnswer[],
  ) {
    const normalizedAnswers = answers.map((entry) => ({
      questionId: entry.questionId,
      answer: sanitizeText(entry.answer),
    }));

    if (
      normalizedAnswers.length === 0 ||
      normalizedAnswers.some(
        ({ answer }) => answer.length < 1 || answer.length > MAX_ANSWER_LENGTH,
      ) ||
      new Set(normalizedAnswers.map(({ questionId }) => questionId)).size !==
        normalizedAnswers.length
    ) {
      throw createError(
        "Provide unique answers containing 1 to 2000 characters.",
        400,
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const questions = await tx.verificationQuestion.findMany({
        where: {
          id: { in: normalizedAnswers.map(({ questionId }) => questionId) },
        },
        include: { claim: true, answers: { select: { id: true } } },
      });
      if (questions.length !== normalizedAnswers.length) {
        throw createError(
          "One or more verification questions were not found",
          404,
        );
      }

      const claimId = questions[0]?.claimId;
      if (
        !claimId ||
        questions.some((question) => question.claimId !== claimId)
      ) {
        throw createError("Answers must belong to the same claim", 400);
      }

      const claim = questions[0].claim;
      if (claim.claimantId !== claimantId) {
        throw createError(
          "Only the claimant can submit verification answers",
          403,
        );
      }
      if (claim.status !== ClaimStatus.PENDING) {
        throw createError(
          "Answers can only be submitted while the claim is PENDING",
          400,
        );
      }
      if (questions.some((question) => question.answers.length > 0)) {
        throw createError(
          "Only unanswered verification questions can be answered",
          400,
        );
      }

      const createdAnswers = await Promise.all(
        normalizedAnswers.map(({ questionId, answer }) =>
          tx.verificationAnswer.create({
            data: { questionId, claimantId, answer },
          }),
        ),
      );

      const allQuestions = await tx.verificationQuestion.findMany({
        where: { claimId },
        include: { answers: { select: { id: true } } },
      });
      const submittedQuestionIds = new Set(
        normalizedAnswers.map(({ questionId }) => questionId),
      );
      const allAnswered = allQuestions.every(
        (question) =>
          question.answers.length > 0 || submittedQuestionIds.has(question.id),
      );

      if (allAnswered) {
        await tx.claim.update({
          where: { id: claimId },
          data: { status: ClaimStatus.UNDER_REVIEW },
        });
      }

      return { claimId, finderId: claim.finderId, allAnswered, createdAnswers };
    });

    if (result.allAnswered) {
      await notifySafely({
        userId: result.finderId,
        type: NotificationType.ANSWERS_SUBMITTED,
        title: "Verification Answers Submitted",
        message:
          "The claimant has answered all verification questions. The claim is ready for review.",
        link: frontendLink(`/claims/${result.claimId}`),
      });
    }

    return result.createdAnswers;
  }

  static async reviewAnswer(
    finderId: string,
    answerId: string,
    reviewStatus: Exclude<VerificationReviewStatus, "PENDING">,
  ) {
    const answer = await prisma.verificationAnswer.findUnique({
      where: { id: answerId },
      include: { question: { include: { claim: true } } },
    });
    if (!answer) throw createError("Verification answer not found", 404);
    if (answer.question.claim.finderId !== finderId) {
      throw createError("Only the finder can review this answer", 403);
    }
    if (answer.reviewStatus !== VerificationReviewStatus.PENDING) {
      throw createError("This answer has already been reviewed", 400);
    }

    return prisma.verificationAnswer.update({
      where: { id: answerId },
      data: { reviewStatus },
    });
  }
}
