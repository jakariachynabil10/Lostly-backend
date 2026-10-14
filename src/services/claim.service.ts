import { prisma } from "../prisma";
import { ClaimStatus, ReportStatus, NotificationType, Prisma } from "@prisma/client";
import { AppError } from "../middleware/error.middleware";
import { NotificationService } from "./notification.service";

export interface CreateClaimInput {
  matchId: string;
}

export type ClaimAction = "approve" | "reject" | "cancel" | "complete";

export interface ClaimActionInput {
  action: ClaimAction;
  reviewNotes?: string;
}

export interface ClaimQueryOptions {
  role?: "claimant" | "finder";
  status?: ClaimStatus;
  page?: number;
  limit?: number;
}

export class ClaimService {
  /**
   * Helper to check if a report has any remaining active claims (PENDING or UNDER_REVIEW)
   */
  private static async hasOtherActiveClaims(
    tx: Prisma.TransactionClient,
    reportId: string,
    excludeClaimId?: string
  ): Promise<boolean> {
    const activeCount = await tx.claim.count({
      where: {
        id: excludeClaimId ? { not: excludeClaimId } : undefined,
        status: { in: [ClaimStatus.PENDING, ClaimStatus.UNDER_REVIEW] },
        match: {
          OR: [{ lostReportId: reportId }, { foundReportId: reportId }],
        },
      },
    });
    return activeCount > 0;
  }

  /**
   * Helper to revert report status to MATCH_FOUND if no other active claim exists
   */
  private static async revertReportStatusIfNeeded(
    tx: Prisma.TransactionClient,
    reportId: string,
    excludeClaimId: string
  ) {
    const hasActive = await this.hasOtherActiveClaims(tx, reportId, excludeClaimId);
    if (!hasActive) {
      await tx.itemReport.update({
        where: { id: reportId },
        data: { status: ReportStatus.MATCH_FOUND },
      });
    }
  }

  /**
   * Create a new claim against a match
   */
  static async createClaim(claimantId: string, input: CreateClaimInput) {
    // 1. Fetch match and its reports
    const match = await prisma.match.findUnique({
      where: { id: input.matchId },
      include: {
        lostReport: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
        foundReport: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    if (!match) {
      const err: AppError = new Error("Match candidate not found");
      err.statusCode = 404;
      throw err;
    }

    // 2. Ownership & Role Validation
    // Claimant must be the owner of the LOST report
    if (match.lostReport.userId !== claimantId) {
      const err: AppError = new Error("Only the owner of the lost report can initiate an ownership claim");
      err.statusCode = 403;
      throw err;
    }

    // Users cannot claim against their own reports
    if (match.foundReport.userId === claimantId) {
      const err: AppError = new Error("You cannot submit an ownership claim against your own report");
      err.statusCode = 400;
      throw err;
    }

    // Reports must not already be RESOLVED or CLOSED
    if (
      match.lostReport.status === ReportStatus.RESOLVED ||
      match.lostReport.status === ReportStatus.CLOSED ||
      match.foundReport.status === ReportStatus.RESOLVED ||
      match.foundReport.status === ReportStatus.CLOSED
    ) {
      const err: AppError = new Error("Cannot claim an item that is already resolved or closed");
      err.statusCode = 400;
      throw err;
    }

    // 3. Limit each claimant to 5 active claims at once (PENDING or UNDER_REVIEW)
    const activeClaimsCount = await prisma.claim.count({
      where: {
        claimantId,
        status: { in: [ClaimStatus.PENDING, ClaimStatus.UNDER_REVIEW] },
      },
    });

    if (activeClaimsCount >= 5) {
      const err: AppError = new Error(
        "Active claim limit reached (maximum 5 concurrent active claims allowed). Please await resolution of existing claims."
      );
      err.statusCode = 400;
      throw err;
    }

    // 4. Enforce only one active claim per (match, claimant)
    const existingActiveClaim = await prisma.claim.findFirst({
      where: {
        matchId: match.id,
        claimantId,
        status: { in: [ClaimStatus.PENDING, ClaimStatus.UNDER_REVIEW] },
      },
    });

    if (existingActiveClaim) {
      const err: AppError = new Error(
        "You already have an active claim under review for this match."
      );
      err.statusCode = 400;
      throw err;
    }

    // 5. Execute creation within a Prisma $transaction
    const finderId = match.foundReport.userId;

    const result = await prisma.$transaction(async (tx) => {
      // Create Claim
      const claim = await tx.claim.create({
        data: {
          matchId: match.id,
          claimantId,
          finderId,
          status: ClaimStatus.PENDING,
        },
      });

      // Update both reports to CLAIM_PENDING
      await tx.itemReport.update({
        where: { id: match.lostReportId },
        data: { status: ReportStatus.CLAIM_PENDING },
      });

      await tx.itemReport.update({
        where: { id: match.foundReportId },
        data: { status: ReportStatus.CLAIM_PENDING },
      });

      return claim;
    });

    // 6. Notify Finder (CLAIM_RECEIVED)
    await NotificationService.createNotification({
      userId: finderId,
      type: NotificationType.CLAIM_RECEIVED,
      title: "New Ownership Claim Received",
      message: `${match.lostReport.user.name} submitted an ownership claim for the found item "${match.foundReport.itemName}". Please set up verification questions.`,
      link: `/claims/${result.id}`,
    });

    return result;
  }

  /**
   * List claims for a user (either as claimant or finder)
   */
  static async getClaims(userId: string, options: ClaimQueryOptions = {}) {
    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(options.limit) || 10));
    const skip = (page - 1) * limit;

    const where: Prisma.ClaimWhereInput = {};

    if (options.role === "claimant") {
      where.claimantId = userId;
    } else if (options.role === "finder") {
      where.finderId = userId;
    } else {
      where.OR = [{ claimantId: userId }, { finderId: userId }];
    }

    if (options.status) {
      where.status = options.status;
    }

    const [claims, total] = await Promise.all([
      prisma.claim.findMany({
        where,
        include: {
          claimant: {
            select: { id: true, name: true, profileImage: true },
          },
          finder: {
            select: { id: true, name: true, profileImage: true },
          },
          match: {
            include: {
              lostReport: {
                select: {
                  id: true,
                  itemName: true,
                  imageUrl: true,
                  location: true,
                  date: true,
                  status: true,
                },
              },
              foundReport: {
                select: {
                  id: true,
                  itemName: true,
                  imageUrl: true,
                  location: true,
                  date: true,
                  status: true,
                },
              },
            },
          },
          _count: {
            select: { questions: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.claim.count({ where }),
    ]);

    return {
      claims,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get single claim detail (participants only)
   * Contact details are hidden until APPROVED or COMPLETED
   */
  static async getClaimById(claimId: string, userId: string) {
    const claim = await prisma.claim.findUnique({
      where: { id: claimId },
      include: {
        claimant: {
          select: { id: true, name: true, email: true, profileImage: true },
        },
        finder: {
          select: { id: true, name: true, email: true, profileImage: true },
        },
        match: {
          include: {
            lostReport: {
              include: {
                category: true,
                user: { select: { id: true, name: true } },
              },
            },
            foundReport: {
              include: {
                category: true,
                user: { select: { id: true, name: true } },
              },
            },
          },
        },
        questions: {
          include: {
            answers: {
              orderBy: { createdAt: "asc" },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!claim) {
      const err: AppError = new Error("Claim room not found");
      err.statusCode = 404;
      throw err;
    }

    // Authorization: only claimant or finder can access
    const isClaimant = claim.claimantId === userId;
    const isFinder = claim.finderId === userId;

    if (!isClaimant && !isFinder) {
      const err: AppError = new Error("Unauthorized to access this verification room");
      err.statusCode = 403;
      throw err;
    }

    // Enforce privacy rule: Contact details hidden until claim is APPROVED or COMPLETED
    const canSeeContactDetails =
      claim.status === ClaimStatus.APPROVED || claim.status === ClaimStatus.COMPLETED;

    return {
      ...claim,
      userRole: isClaimant ? ("claimant" as const) : ("finder" as const),
      claimant: {
        id: claim.claimant.id,
        name: claim.claimant.name,
        profileImage: claim.claimant.profileImage,
        email: canSeeContactDetails ? claim.claimant.email : undefined,
      },
      finder: {
        id: claim.finder.id,
        name: claim.finder.name,
        profileImage: claim.finder.profileImage,
        email: canSeeContactDetails ? claim.finder.email : undefined,
      },
    };
  }

  /**
   * Transition claim actions: approve, reject, cancel, complete
   */
  static async handleClaimAction(
    claimId: string,
    userId: string,
    input: ClaimActionInput
  ) {
    const claim = await prisma.claim.findUnique({
      where: { id: claimId },
      include: {
        match: {
          include: {
            lostReport: true,
            foundReport: true,
          },
        },
      },
    });

    if (!claim) {
      const err: AppError = new Error("Claim not found");
      err.statusCode = 404;
      throw err;
    }

    const isClaimant = claim.claimantId === userId;
    const isFinder = claim.finderId === userId;

    if (!isClaimant && !isFinder) {
      const err: AppError = new Error("Unauthorized to modify this claim");
      err.statusCode = 403;
      throw err;
    }

    const { action, reviewNotes } = input;

    switch (action) {
      case "approve": {
        // Only finder can approve
        if (!isFinder) {
          const err: AppError = new Error("Only the finder can approve an ownership claim");
          err.statusCode = 403;
          throw err;
        }

        // Only from UNDER_REVIEW
        if (claim.status !== ClaimStatus.UNDER_REVIEW) {
          const err: AppError = new Error(
            `Cannot approve claim from status ${claim.status}. Claim must be UNDER_REVIEW.`
          );
          err.statusCode = 400;
          throw err;
        }

        // Rule 8: Only one APPROVED claim per found report at a time
        const existingApproved = await prisma.claim.findFirst({
          where: {
            id: { not: claim.id },
            status: ClaimStatus.APPROVED,
            match: {
              foundReportId: claim.match.foundReportId,
            },
          },
        });

        if (existingApproved) {
          const err: AppError = new Error(
            "Another claim on this found item is already approved. Cannot approve multiple claims simultaneously."
          );
          err.statusCode = 400;
          throw err;
        }

        // Update claim to APPROVED in transaction
        const updatedClaim = await prisma.$transaction(async (tx) => {
          return tx.claim.update({
            where: { id: claim.id },
            data: {
              status: ClaimStatus.APPROVED,
              reviewedAt: new Date(),
              reviewNotes: reviewNotes?.trim() || null,
            },
          });
        });

        // Notify Claimant (CLAIM_APPROVED)
        await NotificationService.createNotification({
          userId: claim.claimantId,
          type: NotificationType.CLAIM_APPROVED,
          title: "Ownership Claim Approved!",
          message: `Your ownership claim for "${claim.match.foundReport.itemName}" was approved! Contact details are now unlocked.`,
          link: `/claims/${claim.id}`,
        });

        return updatedClaim;
      }

      case "reject": {
        // Only finder can reject
        if (!isFinder) {
          const err: AppError = new Error("Only the finder can reject this claim");
          err.statusCode = 403;
          throw err;
        }

        // Allowed from PENDING or UNDER_REVIEW
        if (
          claim.status !== ClaimStatus.PENDING &&
          claim.status !== ClaimStatus.UNDER_REVIEW
        ) {
          const err: AppError = new Error(
            `Cannot reject claim from status ${claim.status}. Claim must be PENDING or UNDER_REVIEW.`
          );
          err.statusCode = 400;
          throw err;
        }

        // Reason (reviewNotes) is required
        if (!reviewNotes || !reviewNotes.trim()) {
          const err: AppError = new Error(
            "A clear rejection reason (reviewNotes) is required when rejecting a claim."
          );
          err.statusCode = 400;
          throw err;
        }

        // Transaction: reject claim and revert reports if no other active claims
        const updatedClaim = await prisma.$transaction(async (tx) => {
          const updated = await tx.claim.update({
            where: { id: claim.id },
            data: {
              status: ClaimStatus.REJECTED,
              reviewNotes: reviewNotes.trim(),
              reviewedAt: new Date(),
            },
          });

          // Rule 7: Revert reports if no other active claim
          await this.revertReportStatusIfNeeded(tx, claim.match.lostReportId, claim.id);
          await this.revertReportStatusIfNeeded(tx, claim.match.foundReportId, claim.id);

          return updated;
        });

        // Notify Claimant (CLAIM_REJECTED)
        await NotificationService.createNotification({
          userId: claim.claimantId,
          type: NotificationType.CLAIM_REJECTED,
          title: "Ownership Claim Rejected",
          message: `Your claim for "${claim.match.foundReport.itemName}" was rejected. Reason: "${reviewNotes.trim()}".`,
          link: `/claims/${claim.id}`,
        });

        return updatedClaim;
      }

      case "cancel": {
        // Only claimant can cancel
        if (!isClaimant) {
          const err: AppError = new Error("Only the claimant can cancel this claim");
          err.statusCode = 403;
          throw err;
        }

        // Allowed from PENDING or UNDER_REVIEW
        if (
          claim.status !== ClaimStatus.PENDING &&
          claim.status !== ClaimStatus.UNDER_REVIEW
        ) {
          const err: AppError = new Error(
            `Cannot cancel claim from status ${claim.status}. Claim must be PENDING or UNDER_REVIEW.`
          );
          err.statusCode = 400;
          throw err;
        }

        // Transaction: cancel claim and revert reports if no other active claims
        const updatedClaim = await prisma.$transaction(async (tx) => {
          const updated = await tx.claim.update({
            where: { id: claim.id },
            data: {
              status: ClaimStatus.CANCELLED,
            },
          });

          // Rule 7: Revert reports if no other active claim
          await this.revertReportStatusIfNeeded(tx, claim.match.lostReportId, claim.id);
          await this.revertReportStatusIfNeeded(tx, claim.match.foundReportId, claim.id);

          return updated;
        });

        // Notify Finder (CLAIM_CANCELLED)
        await NotificationService.createNotification({
          userId: claim.finderId,
          type: NotificationType.CLAIM_CANCELLED,
          title: "Claim Cancelled",
          message: `The ownership claim for "${claim.match.foundReport.itemName}" was cancelled by the claimant.`,
          link: `/claims/${claim.id}`,
        });

        return updatedClaim;
      }

      case "complete": {
        // Only finder can complete
        if (!isFinder) {
          const err: AppError = new Error("Only the finder can mark an item as returned");
          err.statusCode = 403;
          throw err;
        }

        // Must be in APPROVED status
        if (claim.status !== ClaimStatus.APPROVED) {
          const err: AppError = new Error(
            `Cannot complete claim from status ${claim.status}. Claim must be APPROVED first.`
          );
          err.statusCode = 400;
          throw err;
        }

        // Transaction: Mark claim COMPLETED, both reports RESOLVED, cancel conflicting claims
        const { completedClaim, otherCancelledClaims } = await prisma.$transaction(
          async (tx) => {
            // 1. Mark this claim COMPLETED
            const completed = await tx.claim.update({
              where: { id: claim.id },
              data: {
                status: ClaimStatus.COMPLETED,
                completedAt: new Date(),
              },
            });

            // 2. Mark both reports RESOLVED
            await tx.itemReport.update({
              where: { id: claim.match.lostReportId },
              data: { status: ReportStatus.RESOLVED },
            });

            await tx.itemReport.update({
              where: { id: claim.match.foundReportId },
              data: { status: ReportStatus.RESOLVED },
            });

            // Rule 9: Automatically CANCEL any other open claims touching either of the two reports
            const otherClaims = await tx.claim.findMany({
              where: {
                id: { not: claim.id },
                status: {
                  in: [
                    ClaimStatus.PENDING,
                    ClaimStatus.UNDER_REVIEW,
                    ClaimStatus.APPROVED,
                  ],
                },
                match: {
                  OR: [
                    { lostReportId: claim.match.lostReportId },
                    { foundReportId: claim.match.foundReportId },
                  ],
                },
              },
              select: { id: true, claimantId: true },
            });

            if (otherClaims.length > 0) {
              await tx.claim.updateMany({
                where: {
                  id: { in: otherClaims.map((c) => c.id) },
                },
                data: {
                  status: ClaimStatus.CANCELLED,
                  reviewNotes: "Auto-cancelled: item has been returned and resolved in another claim.",
                },
              });
            }

            return {
              completedClaim: completed,
              otherCancelledClaims: otherClaims,
            };
          }
        );

        // Notify Claimant (CLAIM_COMPLETED)
        await NotificationService.createNotification({
          userId: claim.claimantId,
          type: NotificationType.CLAIM_COMPLETED,
          title: "Item Returned & Recovery Complete!",
          message: `The finder marked "${claim.match.foundReport.itemName}" as returned. Your recovery is complete!`,
          link: `/claims/${claim.id}`,
        });

        // Notify other claimants whose claims were auto-cancelled
        for (const other of otherCancelledClaims) {
          if (other.claimantId !== claim.claimantId) {
            await NotificationService.createNotification({
              userId: other.claimantId,
              type: NotificationType.CLAIM_CANCELLED,
              title: "Claim Closed",
              message: `The item "${claim.match.foundReport.itemName}" was confirmed returned to another owner and has been resolved.`,
              link: `/claims/${other.id}`,
            });
          }
        }

        return completedClaim;
      }

      default: {
        const err: AppError = new Error(`Unsupported action: ${action}`);
        err.statusCode = 400;
        throw err;
      }
    }
  }
}
