import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ClaimStatus,
  NotificationType,
  Prisma,
  ReportStatus,
  VerificationReviewStatus,
} from "@prisma/client";

const { tx, prismaMock, notificationMock } = vi.hoisted(() => {
  const tx = {
    claim: {
      count: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    verificationQuestion: { findMany: vi.fn() },
    itemReport: { update: vi.fn() },
  };

  return {
    tx,
    prismaMock: {
      claim: { findUnique: vi.fn() },
      match: { findUnique: vi.fn() },
      $transaction: vi.fn(
        async (callback: (client: typeof tx) => unknown, _options?: unknown) =>
          callback(tx),
      ),
    },
    notificationMock: { createNotification: vi.fn() },
  };
});

vi.mock("../src/prisma", () => ({ prisma: prismaMock }));
vi.mock("../src/services/notification.service", () => ({
  NotificationService: notificationMock,
}));

import { ClaimService } from "../src/services/claim.service";

function claimFixture(status: ClaimStatus) {
  return {
    id: "claim-1",
    matchId: "match-1",
    claimantId: "claimant-1",
    finderId: "finder-1",
    status,
    match: {
      lostReportId: "lost-1",
      foundReportId: "found-1",
      lostReport: { id: "lost-1", itemName: "Wallet" },
      foundReport: { id: "found-1", itemName: "Wallet" },
    },
  };
}

function matchFixture(lostOwnerId = "claimant-1", foundOwnerId = "finder-1") {
  return {
    id: "match-1",
    lostReportId: "lost-1",
    foundReportId: "found-1",
    lostReport: {
      userId: lostOwnerId,
      status: ReportStatus.MATCH_FOUND,
      user: { name: "A" },
    },
    foundReport: {
      userId: foundOwnerId,
      status: ReportStatus.MATCH_FOUND,
      itemName: "Wallet",
      user: { name: "B" },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  tx.claim.count.mockResolvedValue(0);
  tx.claim.findFirst.mockResolvedValue(null);
  tx.claim.create.mockResolvedValue(claimFixture(ClaimStatus.PENDING));
  tx.claim.update.mockImplementation(async ({ data }: { data: object }) => ({
    ...claimFixture(ClaimStatus.UNDER_REVIEW),
    ...data,
  }));
  tx.claim.findMany.mockResolvedValue([]);
  tx.claim.findUniqueOrThrow.mockResolvedValue(
    claimFixture(ClaimStatus.UNDER_REVIEW),
  );
  tx.verificationQuestion.findMany.mockResolvedValue([
    { answers: [{ reviewStatus: VerificationReviewStatus.ACCEPTED }] },
  ]);
  tx.claim.updateMany.mockResolvedValue({ count: 1 });
  tx.itemReport.update.mockResolvedValue({});
  notificationMock.createNotification.mockResolvedValue({
    id: "notification-1",
  });
});

afterEach(() => vi.restoreAllMocks());

describe("ClaimService.handleClaimAction", () => {
  it("allows the finder to approve an under-review claim", async () => {
    prismaMock.claim.findUnique.mockResolvedValue(
      claimFixture(ClaimStatus.UNDER_REVIEW),
    );
    tx.claim.findUniqueOrThrow.mockResolvedValue(
      claimFixture(ClaimStatus.APPROVED),
    );

    const result = await ClaimService.handleClaimAction("claim-1", "finder-1", {
      action: "approve",
    });

    expect(result.status).toBe(ClaimStatus.APPROVED);
    expect(tx.claim.updateMany).toHaveBeenCalledWith({
      where: {
        id: "claim-1",
        status: { in: [ClaimStatus.UNDER_REVIEW] },
      },
      data: expect.objectContaining({ status: ClaimStatus.APPROVED }),
    });
    expect(tx.claim.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: ClaimStatus.APPROVED }),
      }),
    );
    expect(prismaMock.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
    expect(notificationMock.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "claimant-1",
        type: NotificationType.CLAIM_APPROVED,
      }),
    );
  });

  it("rejects an approval attempt by the claimant", async () => {
    prismaMock.claim.findUnique.mockResolvedValue(
      claimFixture(ClaimStatus.UNDER_REVIEW),
    );

    await expect(
      ClaimService.handleClaimAction("claim-1", "claimant-1", {
        action: "approve",
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("rejects approval from PENDING", async () => {
    prismaMock.claim.findUnique.mockResolvedValue(
      claimFixture(ClaimStatus.PENDING),
    );

    await expect(
      ClaimService.handleClaimAction("claim-1", "finder-1", {
        action: "approve",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("rejects approval when an answer is not accepted", async () => {
    prismaMock.claim.findUnique.mockResolvedValue(
      claimFixture(ClaimStatus.UNDER_REVIEW),
    );
    tx.verificationQuestion.findMany.mockResolvedValue([
      { answers: [{ reviewStatus: VerificationReviewStatus.REJECTED }] },
    ]);

    await expect(
      ClaimService.handleClaimAction("claim-1", "finder-1", {
        action: "approve",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(tx.claim.updateMany).not.toHaveBeenCalled();
  });

  it("rejects approval when no verification questions exist", async () => {
    prismaMock.claim.findUnique.mockResolvedValue(
      claimFixture(ClaimStatus.UNDER_REVIEW),
    );
    tx.verificationQuestion.findMany.mockResolvedValue([]);

    await expect(
      ClaimService.handleClaimAction("claim-1", "finder-1", {
        action: "approve",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("blocks a second approved claim for the found report", async () => {
    prismaMock.claim.findUnique.mockResolvedValue(
      claimFixture(ClaimStatus.UNDER_REVIEW),
    );
    tx.claim.findFirst.mockResolvedValue({ id: "existing-approved-claim" });

    await expect(
      ClaimService.handleClaimAction("claim-1", "finder-1", {
        action: "approve",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(tx.claim.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a cancellation attempt by the finder", async () => {
    prismaMock.claim.findUnique.mockResolvedValue(
      claimFixture(ClaimStatus.PENDING),
    );

    await expect(
      ClaimService.handleClaimAction("claim-1", "finder-1", {
        action: "cancel",
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("rejects access by a non-participant", async () => {
    prismaMock.claim.findUnique.mockResolvedValue(
      claimFixture(ClaimStatus.PENDING),
    );

    await expect(
      ClaimService.getClaimById("claim-1", "outsider-1"),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("returns 404 for a missing claim", async () => {
    prismaMock.claim.findUnique.mockResolvedValue(null);

    await expect(
      ClaimService.handleClaimAction("missing", "finder-1", {
        action: "complete",
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("returns 409 without changing reports when the claim status changed concurrently", async () => {
    prismaMock.claim.findUnique.mockResolvedValue(
      claimFixture(ClaimStatus.PENDING),
    );
    tx.claim.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      ClaimService.handleClaimAction("claim-1", "claimant-1", {
        action: "cancel",
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: "Claim was modified, please refresh",
    });
    expect(tx.claim.updateMany).toHaveBeenCalledWith({
      where: {
        id: "claim-1",
        status: { in: [ClaimStatus.PENDING, ClaimStatus.UNDER_REVIEW] },
      },
      data: { status: ClaimStatus.CANCELLED },
    });
    expect(tx.itemReport.update).not.toHaveBeenCalled();
  });

  it("guards rejection with the allowed current statuses", async () => {
    prismaMock.claim.findUnique.mockResolvedValue(
      claimFixture(ClaimStatus.PENDING),
    );
    tx.claim.findUniqueOrThrow.mockResolvedValue(
      claimFixture(ClaimStatus.REJECTED),
    );

    await ClaimService.handleClaimAction("claim-1", "finder-1", {
      action: "reject",
      reviewNotes: "Insufficient proof",
    });

    expect(tx.claim.updateMany).toHaveBeenCalledWith({
      where: {
        id: "claim-1",
        status: { in: [ClaimStatus.PENDING, ClaimStatus.UNDER_REVIEW] },
      },
      data: expect.objectContaining({ status: ClaimStatus.REJECTED }),
    });
  });

  it("rejects without a review reason", async () => {
    prismaMock.claim.findUnique.mockResolvedValue(
      claimFixture(ClaimStatus.PENDING),
    );

    await expect(
      ClaimService.handleClaimAction("claim-1", "finder-1", {
        action: "reject",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("rejects completion from UNDER_REVIEW", async () => {
    prismaMock.claim.findUnique.mockResolvedValue(
      claimFixture(ClaimStatus.UNDER_REVIEW),
    );

    await expect(
      ClaimService.handleClaimAction("claim-1", "finder-1", {
        action: "complete",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("restores unrelated reports after cancelling competing claims on completion", async () => {
    prismaMock.claim.findUnique.mockResolvedValue(
      claimFixture(ClaimStatus.APPROVED),
    );
    tx.claim.findMany.mockResolvedValue([
      {
        id: "claim-2",
        claimantId: "claimant-2",
        match: { lostReportId: "other-lost", foundReportId: "other-found" },
      },
    ]);

    await ClaimService.handleClaimAction("claim-1", "finder-1", {
      action: "complete",
    });

    expect(tx.claim.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          id: "claim-1",
          status: { in: [ClaimStatus.APPROVED] },
        },
        data: expect.objectContaining({ status: ClaimStatus.COMPLETED }),
      }),
    );
    expect(tx.claim.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          id: "claim-2",
          status: {
            in: [
              ClaimStatus.PENDING,
              ClaimStatus.UNDER_REVIEW,
              ClaimStatus.APPROVED,
            ],
          },
        },
        data: expect.objectContaining({ status: ClaimStatus.CANCELLED }),
      }),
    );
    expect(tx.itemReport.update).toHaveBeenCalledWith({
      where: { id: "other-lost" },
      data: { status: ReportStatus.MATCH_FOUND },
    });
    expect(tx.itemReport.update).toHaveBeenCalledWith({
      where: { id: "other-found" },
      data: { status: ReportStatus.MATCH_FOUND },
    });
  });

  it("reverts both reports after rejection when no active claims remain", async () => {
    prismaMock.claim.findUnique.mockResolvedValue(
      claimFixture(ClaimStatus.PENDING),
    );

    await ClaimService.handleClaimAction("claim-1", "finder-1", {
      action: "reject",
      reviewNotes: "Insufficient ownership details",
    });

    expect(tx.itemReport.update).toHaveBeenCalledWith({
      where: { id: "lost-1" },
      data: { status: ReportStatus.MATCH_FOUND },
    });
    expect(tx.itemReport.update).toHaveBeenCalledWith({
      where: { id: "found-1" },
      data: { status: ReportStatus.MATCH_FOUND },
    });
  });

  it("reverts both reports after cancellation when no active claims remain", async () => {
    prismaMock.claim.findUnique.mockResolvedValue(
      claimFixture(ClaimStatus.PENDING),
    );

    await ClaimService.handleClaimAction("claim-1", "claimant-1", {
      action: "cancel",
    });

    expect(tx.itemReport.update).toHaveBeenCalledWith({
      where: { id: "lost-1" },
      data: { status: ReportStatus.MATCH_FOUND },
    });
    expect(tx.itemReport.update).toHaveBeenCalledWith({
      where: { id: "found-1" },
      data: { status: ReportStatus.MATCH_FOUND },
    });
  });
});

describe("ClaimService.createClaim", () => {
  it("rejects a claimant who does not own the lost report", async () => {
    prismaMock.match.findUnique.mockResolvedValue(
      matchFixture("different-user", "finder-1"),
    );

    await expect(
      ClaimService.createClaim("claimant-1", { matchId: "match-1" }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a claimant's own found report", async () => {
    prismaMock.match.findUnique.mockResolvedValue(
      matchFixture("claimant-1", "claimant-1"),
    );

    await expect(
      ClaimService.createClaim("claimant-1", { matchId: "match-1" }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("enforces the five-active-claim limit inside Serializable isolation", async () => {
    prismaMock.match.findUnique.mockResolvedValue({
      id: "match-1",
      lostReportId: "lost-1",
      foundReportId: "found-1",
      lostReport: {
        userId: "claimant-1",
        status: ReportStatus.MATCH_FOUND,
        user: { name: "A" },
      },
      foundReport: {
        userId: "finder-1",
        status: ReportStatus.MATCH_FOUND,
        itemName: "Wallet",
        user: { name: "B" },
      },
    });
    tx.claim.count.mockResolvedValue(5);

    await expect(
      ClaimService.createClaim("claimant-1", { matchId: "match-1" }),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(prismaMock.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
    expect(tx.claim.findFirst).not.toHaveBeenCalled();
    expect(tx.claim.create).not.toHaveBeenCalled();
  });

  it("rejects a second active claim for the same match", async () => {
    prismaMock.match.findUnique.mockResolvedValue({
      id: "match-1",
      lostReportId: "lost-1",
      foundReportId: "found-1",
      lostReport: {
        userId: "claimant-1",
        status: ReportStatus.MATCH_FOUND,
        user: { name: "A" },
      },
      foundReport: {
        userId: "finder-1",
        status: ReportStatus.MATCH_FOUND,
        itemName: "Wallet",
        user: { name: "B" },
      },
    });
    tx.claim.findFirst.mockResolvedValue({ id: "claim-existing" });

    await expect(
      ClaimService.createClaim("claimant-1", { matchId: "match-1" }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(tx.claim.create).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });

  it("retries active-claim checks once after a serialization failure", async () => {
    prismaMock.match.findUnique.mockResolvedValue({
      id: "match-1",
      lostReportId: "lost-1",
      foundReportId: "found-1",
      lostReport: {
        userId: "claimant-1",
        status: ReportStatus.MATCH_FOUND,
        user: { name: "A" },
      },
      foundReport: {
        userId: "finder-1",
        status: ReportStatus.MATCH_FOUND,
        itemName: "Wallet",
        user: { name: "B" },
      },
    });
    prismaMock.$transaction.mockRejectedValueOnce(
      Object.assign(new Error("serialization failure"), { code: "P2034" }),
    );

    const created = await ClaimService.createClaim("claimant-1", {
      matchId: "match-1",
    });

    expect(created.id).toBe("claim-1");
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(2);
    expect(prismaMock.$transaction).toHaveBeenNthCalledWith(
      1,
      expect.any(Function),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    expect(prismaMock.$transaction).toHaveBeenNthCalledWith(
      2,
      expect.any(Function),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  });

  it("retries the approved-claim check once after a serialization failure", async () => {
    prismaMock.claim.findUnique.mockResolvedValue(
      claimFixture(ClaimStatus.UNDER_REVIEW),
    );
    tx.claim.findUniqueOrThrow.mockResolvedValue(
      claimFixture(ClaimStatus.APPROVED),
    );
    prismaMock.$transaction.mockRejectedValueOnce(
      Object.assign(new Error("serialization failure"), { code: "P2034" }),
    );

    await ClaimService.handleClaimAction("claim-1", "finder-1", {
      action: "approve",
    });

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(2);
    expect(prismaMock.$transaction).toHaveBeenNthCalledWith(
      2,
      expect.any(Function),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  });
});
