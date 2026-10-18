import { createServer } from "http";
import { app } from "../src/app";
import { prisma } from "../src/prisma";

interface ApiResponse {
  success: boolean;
  message?: string;
  data?: any;
  errors?: unknown[];
}

async function main() {
  const server = createServer(app);
  const createdUserIds: string[] = [];
  let createdCategoryId: string | undefined;
  const previousResendKey = process.env.RESEND_API_KEY;
  const previousSmtpHost = process.env.SMTP_HOST;
  delete process.env.RESEND_API_KEY;
  delete process.env.SMTP_HOST;
  process.env.NODE_ENV = "test";

  try {
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Unable to start scenario server");
    const baseUrl = `http://127.0.0.1:${address.port}/api`;

    async function call(
      method: string,
      path: string,
      token?: string,
      body?: unknown,
    ): Promise<{ status: number; payload: ApiResponse }> {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      return {
        status: response.status,
        payload: (await response.json()) as ApiResponse,
      };
    }

    function requireStatus(
      result: { status: number; payload: ApiResponse },
      expected: number,
      label: string,
    ) {
      if (result.status !== expected) {
        throw new Error(
          `${label}: expected ${expected}, received ${result.status}: ${JSON.stringify(result.payload)}`,
        );
      }
      return result.payload;
    }

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    async function register(letter: string) {
      const result = requireStatus(
        await call("POST", "/auth/register", undefined, {
          name: `Scenario ${letter}`,
          email: `phase2-${letter.toLowerCase()}-${suffix}@example.test`,
          password: "Scenario-pass-2026",
        }),
        201,
        `register ${letter}`,
      );
      createdUserIds.push(result.data.user.id);
      return {
        id: result.data.user.id as string,
        email: result.data.user.email as string,
        token: result.data.accessToken as string,
      };
    }

    const [a, b, c] = await Promise.all([
      register("A"),
      register("B"),
      register("C"),
    ]);
    let category = await prisma.category.findFirst();
    if (!category) {
      category = await prisma.category.create({
        data: { name: `Scenario-${suffix}` },
      });
      createdCategoryId = category.id;
    }

    const reportDate = new Date().toISOString();
    const reportDetails = {
      categoryId: category.id,
      itemName: "Black leather wallet",
      brand: "Bellroy",
      color: "Black",
      description:
        "Black Bellroy leather wallet with a stitched red thread near the card slot.",
      location: "Central Library, Main Desk",
      date: reportDate,
      approximateTime: "10:00 AM",
      identifyingFeatures: "Red stitched thread near the card slot",
    };

    const lostReport = requireStatus(
      await call("POST", "/reports", a.token, {
        ...reportDetails,
        type: "LOST",
      }),
      201,
      "create A lost report",
    ).data;
    const foundReport = requireStatus(
      await call("POST", "/reports", b.token, {
        ...reportDetails,
        type: "FOUND",
      }),
      201,
      "create B found report",
    ).data;

    const aMatches = requireStatus(
      await call("GET", "/matches/my", a.token),
      200,
      "A matches",
    ).data;
    const match = aMatches.find(
      (item: any) => item.myItem.id === lostReport.id,
    );
    if (!match)
      throw new Error(
        "No match was created for the identical lost/found reports",
      );
    if (
      JSON.stringify(match).includes(a.email) ||
      JSON.stringify(match).includes(b.email)
    ) {
      throw new Error("Match response leaked an email address");
    }

    const aNotifications = requireStatus(
      await call("GET", "/notifications", a.token),
      200,
      "A notifications",
    ).data.notifications;
    const bNotifications = requireStatus(
      await call("GET", "/notifications", b.token),
      200,
      "B notifications",
    ).data.notifications;
    const matchNotificationsReceived = {
      A: aNotifications.some(
        (notification: any) => notification.type === "MATCH_FOUND",
      ),
      B: bNotifications.some(
        (notification: any) => notification.type === "MATCH_FOUND",
      ),
    };
    if (!matchNotificationsReceived.A || !matchNotificationsReceived.B) {
      throw new Error(
        `Expected match notifications for A and B: ${JSON.stringify(matchNotificationsReceived)}`,
      );
    }

    const claim = requireStatus(
      await call("POST", "/claims", a.token, { matchId: match.id }),
      201,
      "A creates claim",
    ).data;
    const duplicateClaimResult = await call("POST", "/claims", a.token, {
      matchId: match.id,
    });
    const duplicateClaimStatus = duplicateClaimResult.status;
    if (duplicateClaimStatus !== 409)
      throw new Error(
        `Duplicate claim returned ${duplicateClaimStatus}, expected 409`,
      );
    if (
      duplicateClaimResult.payload.message !==
      "You already have an active claim for this match."
    ) {
      throw new Error("Duplicate claim returned the wrong conflict message");
    }
    const outsiderCreateClaimStatus = (
      await call("POST", "/claims", c.token, { matchId: match.id })
    ).status;
    if (outsiderCreateClaimStatus !== 403) {
      throw new Error(
        `Outsider claim creation returned ${outsiderCreateClaimStatus}, expected 403`,
      );
    }
    const [claimantMatches, finderMatches] = await Promise.all([
      call("GET", "/matches/my", a.token),
      call("GET", "/matches/my", b.token),
    ]);
    const claimantMatchInfo = requireStatus(
      claimantMatches,
      200,
      "A match claim summary",
    ).data.find((item: any) => item.id === match.id)?.claim;
    const finderMatchInfo = requireStatus(
      finderMatches,
      200,
      "B match claim summary",
    ).data.find((item: any) => item.id === match.id)?.claimsReceivedCount;
    if (
      claimantMatchInfo?.id !== claim.id ||
      claimantMatchInfo.status !== "PENDING" ||
      finderMatchInfo !== 1
    ) {
      throw new Error(
        "Match responses did not include participant-scoped claim summaries",
      );
    }

    const claimantApprovalStatus = (
      await call("PATCH", `/claims/${claim.id}`, a.token, { action: "approve" })
    ).status;
    const finderCancellationStatus = (
      await call("PATCH", `/claims/${claim.id}`, b.token, { action: "cancel" })
    ).status;
    if (claimantApprovalStatus !== 403 || finderCancellationStatus !== 403) {
      throw new Error(
        "Claim role checks did not reject claimant approval and finder cancellation",
      );
    }

    const questions = requireStatus(
      await call("POST", "/verification/questions", b.token, {
        claimId: claim.id,
        questions: ["What is the identifying stitch near the card slot?"],
      }),
      201,
      "B adds questions",
    ).data;
    const outsiderQuestionStatus = (
      await call("POST", "/verification/questions", c.token, {
        claimId: claim.id,
        questions: ["What is the answer?"],
      })
    ).status;
    const outsiderClaimStatus = (
      await call("GET", `/claims/${claim.id}`, c.token)
    ).status;

    const answers = requireStatus(
      await call("POST", "/verification/answers", a.token, {
        answers: [
          { questionId: questions[0].id, answer: "A red stitched thread" },
        ],
      }),
      201,
      "A submits answers",
    ).data;
    const outsiderAnswerStatus = (
      await call("POST", "/verification/answers", c.token, {
        answers: [{ questionId: questions[0].id, answer: "Outsider answer" }],
      })
    ).status;
    const outsiderReviewStatus = (
      await call("PATCH", `/verification/answers/${answers[0].id}`, c.token, {
        reviewStatus: "ACCEPTED",
      })
    ).status;
    if (
      [
        outsiderClaimStatus,
        outsiderQuestionStatus,
        outsiderAnswerStatus,
        outsiderReviewStatus,
      ].some((status) => status !== 403)
    ) {
      throw new Error(
        "An outsider unexpectedly accessed a claim or verification endpoint",
      );
    }

    requireStatus(
      await call("PATCH", `/verification/answers/${answers[0].id}`, b.token, {
        reviewStatus: "ACCEPTED",
      }),
      200,
      "B accepts answer",
    );
    const pendingClaimDetails = requireStatus(
      await call("GET", `/claims/${claim.id}`, a.token),
      200,
      "A reads pending claim",
    ).data;
    const contactsHiddenBeforeApproval =
      !pendingClaimDetails.claimant.email && !pendingClaimDetails.finder.email;
    if (!contactsHiddenBeforeApproval)
      throw new Error("Claim contacts were visible before approval");

    requireStatus(
      await call("PATCH", `/claims/${claim.id}`, b.token, {
        action: "approve",
      }),
      200,
      "B approves claim",
    );
    const [approvedForA, approvedForB] = await Promise.all([
      call("GET", `/claims/${claim.id}`, a.token),
      call("GET", `/claims/${claim.id}`, b.token),
    ]);
    const aClaimDetails = requireStatus(
      approvedForA,
      200,
      "A reads approved claim",
    ).data;
    const bClaimDetails = requireStatus(
      approvedForB,
      200,
      "B reads approved claim",
    ).data;
    const contactsVisibleToParticipants =
      aClaimDetails.finder.email === b.email &&
      bClaimDetails.claimant.email === a.email;
    if (!contactsVisibleToParticipants)
      throw new Error(
        "Approved claim contacts were not visible to both participants",
      );
    const outsiderApprovedClaimStatus = (
      await call("GET", `/claims/${claim.id}`, c.token)
    ).status;
    if (outsiderApprovedClaimStatus !== 403) {
      throw new Error(
        "An outsider could access participant contacts after approval",
      );
    }

    requireStatus(
      await call("PATCH", `/claims/${claim.id}`, b.token, {
        action: "complete",
      }),
      200,
      "B marks item returned",
    );
    const [resolvedLost, resolvedFound] = await Promise.all([
      call("GET", `/reports/${lostReport.id}`),
      call("GET", `/reports/${foundReport.id}`),
    ]);
    const bothReportsResolved =
      requireStatus(resolvedLost, 200, "read A report").data.report.status ===
        "RESOLVED" &&
      requireStatus(resolvedFound, 200, "read B report").data.report.status ===
        "RESOLVED";
    if (!bothReportsResolved)
      throw new Error("Both reports were not resolved after completion");

    console.log(
      JSON.stringify(
        {
          matchNotification: matchNotificationsReceived,
          claim: { created: true, duplicateStatus: duplicateClaimStatus },
          matchClaimInfo: {
            claimant: claimantMatchInfo,
            finderClaimsReceivedCount: finderMatchInfo,
          },
          verification: {
            questionsAdded: questions.length,
            answerSubmitted: true,
            answerAccepted: true,
            claimantCannotApproveStatus: claimantApprovalStatus,
            finderCannotCancelStatus: finderCancellationStatus,
          },
          privacy: {
            emailsAbsentFromMatches: true,
            contactsHiddenBeforeApproval,
            contactsVisibleOnlyToParticipants: contactsVisibleToParticipants,
            outsiderStatuses: {
              claim: outsiderClaimStatus,
              questions: outsiderQuestionStatus,
              answers: outsiderAnswerStatus,
              answerReview: outsiderReviewStatus,
              claimCreation: outsiderCreateClaimStatus,
              approvedClaimRoom: outsiderApprovedClaimStatus,
            },
          },
          completion: { bothReportsResolved },
        },
        null,
        2,
      ),
    );
  } finally {
    if (createdUserIds.length) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    if (createdCategoryId) {
      await prisma.category.delete({ where: { id: createdCategoryId } });
    }
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    if (previousResendKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previousResendKey;
    if (previousSmtpHost === undefined) delete process.env.SMTP_HOST;
    else process.env.SMTP_HOST = previousSmtpHost;
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
