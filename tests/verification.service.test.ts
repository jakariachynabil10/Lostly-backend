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
      create: vi.fn(),
      findMany: vi.fn(),
    },
    verificationAnswer: {
      create: vi.fn(),
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
  tx.verificationAnswer.create.mockImplementation(
    async ({ data }: { data: object }) => ({
      id: "answer-1",
      ...data,
    }),
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
      .mockResolvedValueOnce([{ id: "question-1", answers: [] }]);

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

  it("rejects a finder reviewing an answer from another claim", async () => {
    prismaMock.verificationAnswer.findUnique.mockResolvedValue({
      id: "answer-1",
      reviewStatus: VerificationReviewStatus.PENDING,
      question: {
        claim: { finderId: "finder-1" },
      },
    });

    await expect(
      VerificationService.reviewAnswer("outsider-1", "answer-1", "ACCEPTED"),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(prismaMock.verificationAnswer.update).not.toHaveBeenCalled();
  });
});
