import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClaimStatus, NotificationType, ReportStatus } from "@prisma/client";

const { tx, prismaMock, notificationMock } = vi.hoisted(() => {
  const tx = {
    claim: {
      count: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    itemReport: { update: vi.fn() },
  };

  return {
    tx,
    prismaMock: {
      claim: { findUnique: vi.fn() },
      match: { findUnique: vi.fn() },
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) =>
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

beforeEach(() => {
  vi.clearAllMocks();
  tx.claim.count.mockResolvedValue(0);
  tx.claim.findFirst.mockResolvedValue(null);
  tx.claim.update.mockImplementation(async ({ data }: { data: object }) => ({
    ...claimFixture(ClaimStatus.UNDER_REVIEW),
    ...data,
  }));
  tx.claim.findMany.mockResolvedValue([]);
  tx.claim.updateMany.mockResolvedValue({ count: 0 });
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

    const result = await ClaimService.handleClaimAction("claim-1", "finder-1", {
      action: "approve",
    });

    expect(result.status).toBe(ClaimStatus.APPROVED);
    expect(tx.claim.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: ClaimStatus.APPROVED }),
      }),
    );
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

    expect(tx.claim.updateMany).toHaveBeenCalled();
    expect(tx.itemReport.update).toHaveBeenCalledWith({
      where: { id: "other-lost" },
      data: { status: ReportStatus.MATCH_FOUND },
    });
    expect(tx.itemReport.update).toHaveBeenCalledWith({
      where: { id: "other-found" },
      data: { status: ReportStatus.MATCH_FOUND },
    });
  });
});

describe("ClaimService.createClaim", () => {
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
  });
});
