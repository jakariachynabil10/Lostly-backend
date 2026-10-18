import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ClaimStatus,
  NotificationType,
  VerificationReviewStatus,
} from "@prisma/client";

const { tx, prismaMock, notificationMock } = vi.hoisted(() => {
  const tx = {
    claim: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    verificationQuestion: {
      count: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
    },
    verificationAnswer: {
      create: vi.fn(),
      update: vi.fn(),
    },
  };

  return {
    tx,
    prismaMock: {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
      verificationAnswer: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
    },
    notificationMock: { createNotification: vi.fn() },
  };
});

vi.mock("../src/prisma", () => ({ prisma: prismaMock }));
vi.mock("../src/services/notification.service", () => ({
  NotificationService: notificationMock,
}));

import { VerificationService } from "../src/services/verification.service";

beforeEach(() => {
  vi.clearAllMocks();
  notificationMock.createNotification.mockResolvedValue({
    id: "notification-1",
  });
  tx.verificationQuestion.create.mockImplementation(
    async ({ data }: { data: object }) => ({
      id: "question-1",
      ...data,
    }),
  );
  tx.verificationQuestion.count.mockResolvedValue(0);
  tx.verificationAnswer.create.mockImplementation(
    async ({ data }: { data: object }) => ({
      id: "answer-1",
      ...data,
    }),
  );
  tx.verificationAnswer.update.mockImplementation(
    async ({ data }: { data: object }) => ({ id: "answer-1", ...data }),
  );
  tx.claim.update.mockResolvedValue({ id: "claim-1" });
});

describe("VerificationService authorization and transitions", () => {
  it("rejects an outsider adding questions", async () => {
    tx.claim.findUnique.mockResolvedValue({
      id: "claim-1",
      finderId: "finder-1",
      claimantId: "claimant-1",
      status: ClaimStatus.PENDING,
    });

    await expect(
      VerificationService.addQuestions("outsider-1", "claim-1", [
        "What is inside?",
      ]),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(tx.verificationQuestion.create).not.toHaveBeenCalled();
  });

  it("moves UNDER_REVIEW back to PENDING and notifies the claimant of more info", async () => {
    tx.claim.findUnique.mockResolvedValue({
      id: "claim-1",
      finderId: "finder-1",
      claimantId: "claimant-1",
      status: ClaimStatus.UNDER_REVIEW,
    });

    await VerificationService.addQuestions("finder-1", "claim-1", [
      "What color is it?",
    ]);

    expect(tx.claim.update).toHaveBeenCalledWith({
      where: { id: "claim-1" },
      data: { status: ClaimStatus.PENDING },
    });
    expect(notificationMock.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "claimant-1",
        type: NotificationType.MORE_INFO_REQUESTED,
      }),
    );
  });

  it("rejects adding questions when the claim would exceed 15 total", async () => {
    tx.claim.findUnique.mockResolvedValue({
      id: "claim-1",
      finderId: "finder-1",
      claimantId: "claimant-1",
      status: ClaimStatus.PENDING,
    });
    tx.verificationQuestion.count.mockResolvedValue(14);

    await expect(
      VerificationService.addQuestions("finder-1", "claim-1", [
        "Question one?",
        "Question two?",
      ]),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(tx.verificationQuestion.create).not.toHaveBeenCalled();
  });

  it("rejects an outsider answering claim questions", async () => {
    tx.verificationQuestion.findMany.mockResolvedValue([
      {
        id: "question-1",
        claimId: "claim-1",
        claim: {
          id: "claim-1",
          claimantId: "claimant-1",
          finderId: "finder-1",
          status: ClaimStatus.PENDING,
        },
        answers: [],
      },
    ]);

    await expect(
      VerificationService.submitAnswers("outsider-1", [
        { questionId: "question-1", answer: "Blue" },
      ]),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(tx.verificationAnswer.create).not.toHaveBeenCalled();
  });

  it("moves a fully answered claim to UNDER_REVIEW and notifies its finder", async () => {
    tx.verificationQuestion.findMany
      .mockResolvedValueOnce([
        {
          id: "question-1",
          claimId: "claim-1",
          claim: {
            id: "claim-1",
            claimantId: "claimant-1",
            finderId: "finder-1",
            status: ClaimStatus.PENDING,
          },
          answers: [],
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "question-1",
          answers: [{ reviewStatus: VerificationReviewStatus.PENDING }],
        },
      ]);

    await VerificationService.submitAnswers("claimant-1", [
      { questionId: "question-1", answer: "Blue" },
    ]);

    expect(tx.claim.update).toHaveBeenCalledWith({
      where: { id: "claim-1" },
      data: { status: ClaimStatus.UNDER_REVIEW },
    });
    expect(notificationMock.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "finder-1",
        type: NotificationType.ANSWERS_SUBMITTED,
      }),
    );
  });

  it("rejects answering a claim that is not PENDING", async () => {
    tx.verificationQuestion.findMany.mockResolvedValue([
      {
        id: "question-1",
        claimId: "claim-1",
        claim: {
          id: "claim-1",
          claimantId: "claimant-1",
          finderId: "finder-1",
          status: ClaimStatus.UNDER_REVIEW,
        },
        answers: [],
      },
    ]);

    await expect(
      VerificationService.submitAnswers("claimant-1", [
        { questionId: "question-1", answer: "Blue" },
      ]),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(tx.verificationAnswer.create).not.toHaveBeenCalled();
  });

  it("keeps the claim PENDING when answers are partial", async () => {
    tx.verificationQuestion.findMany
      .mockResolvedValueOnce([
        {
          id: "question-1",
          claimId: "claim-1",
          claim: {
            id: "claim-1",
            claimantId: "claimant-1",
            finderId: "finder-1",
            status: ClaimStatus.PENDING,
          },
          answers: [],
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "question-1",
          answers: [{ reviewStatus: VerificationReviewStatus.PENDING }],
        },
        { id: "question-2", answers: [] },
      ]);

    await VerificationService.submitAnswers("claimant-1", [
      { questionId: "question-1", answer: "Blue" },
    ]);

    expect(tx.claim.update).not.toHaveBeenCalled();
    expect(notificationMock.createNotification).not.toHaveBeenCalled();
  });

  it("replaces a rejected answer and resets its review status", async () => {
    tx.verificationQuestion.findMany
      .mockResolvedValueOnce([
        {
          id: "question-1",
          claimId: "claim-1",
          claim: {
            id: "claim-1",
            claimantId: "claimant-1",
            finderId: "finder-1",
            status: ClaimStatus.PENDING,
          },
          answers: [
            { id: "answer-1", reviewStatus: VerificationReviewStatus.REJECTED },
          ],
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "question-1",
          answers: [{ reviewStatus: VerificationReviewStatus.PENDING }],
        },
      ]);

    await VerificationService.submitAnswers("claimant-1", [
      { questionId: "question-1", answer: "Blue with a brass zipper" },
    ]);

    expect(tx.verificationAnswer.update).toHaveBeenCalledWith({
      where: { id: "answer-1" },
      data: {
        answer: "Blue with a brass zipper",
        reviewStatus: VerificationReviewStatus.PENDING,
      },
    });
    expect(tx.verificationAnswer.create).not.toHaveBeenCalled();
    expect(tx.claim.update).toHaveBeenCalledWith({
      where: { id: "claim-1" },
      data: { status: ClaimStatus.UNDER_REVIEW },
    });
  });

  it("rejects a finder reviewing an answer from another claim", async () => {
    prismaMock.verificationAnswer.findUnique.mockResolvedValue({
      id: "answer-1",
      reviewStatus: VerificationReviewStatus.PENDING,
      question: {
        claim: { finderId: "finder-1", status: ClaimStatus.UNDER_REVIEW },
      },
    });

    await expect(
      VerificationService.reviewAnswer("outsider-1", "answer-1", "ACCEPTED"),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(prismaMock.verificationAnswer.update).not.toHaveBeenCalled();
  });

  it("rejects reviewing an answer before the claim is UNDER_REVIEW", async () => {
    prismaMock.verificationAnswer.findUnique.mockResolvedValue({
      id: "answer-1",
      reviewStatus: VerificationReviewStatus.PENDING,
      question: {
        claim: { finderId: "finder-1", status: ClaimStatus.PENDING },
      },
    });

    await expect(
      VerificationService.reviewAnswer("finder-1", "answer-1", "ACCEPTED"),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(prismaMock.verificationAnswer.update).not.toHaveBeenCalled();
  });

  it("allows changing a review decision while the claim is UNDER_REVIEW", async () => {
    prismaMock.verificationAnswer.findUnique
      .mockResolvedValueOnce({
        id: "answer-1",
        reviewStatus: VerificationReviewStatus.PENDING,
        question: {
          claim: { finderId: "finder-1", status: ClaimStatus.UNDER_REVIEW },
        },
      })
      .mockResolvedValueOnce({
        id: "answer-1",
        reviewStatus: VerificationReviewStatus.ACCEPTED,
        question: {
          claim: { finderId: "finder-1", status: ClaimStatus.UNDER_REVIEW },
        },
      });

    await VerificationService.reviewAnswer("finder-1", "answer-1", "ACCEPTED");
    await VerificationService.reviewAnswer("finder-1", "answer-1", "REJECTED");

    expect(prismaMock.verificationAnswer.update).toHaveBeenNthCalledWith(1, {
      where: { id: "answer-1" },
      data: { reviewStatus: VerificationReviewStatus.ACCEPTED },
    });
    expect(prismaMock.verificationAnswer.update).toHaveBeenNthCalledWith(2, {
      where: { id: "answer-1" },
      data: { reviewStatus: VerificationReviewStatus.REJECTED },
    });
  });
});
