import { prisma } from "../prisma";
import { ClaimStatus, ReportType, ReportStatus } from "@prisma/client";

export class DashboardService {
  static async getStats(userId: string) {
    const [
      myLostCount,
      myFoundCount,
      myResolvedCount,
      totalLostCount,
      totalFoundCount,
      totalMatchesCount,
      totalResolvedCount,
      pendingClaims,
      successfulRecoveries,
    ] = await Promise.all([
      prisma.itemReport.count({ where: { userId, type: ReportType.LOST } }),
      prisma.itemReport.count({ where: { userId, type: ReportType.FOUND } }),
      prisma.itemReport.count({
        where: { userId, status: ReportStatus.RESOLVED },
      }),
      prisma.itemReport.count({ where: { type: ReportType.LOST } }),
      prisma.itemReport.count({ where: { type: ReportType.FOUND } }),
      prisma.match.count(),
      prisma.itemReport.count({ where: { status: ReportStatus.RESOLVED } }),
      prisma.claim.count({
        where: {
          status: { in: [ClaimStatus.PENDING, ClaimStatus.UNDER_REVIEW] },
          OR: [{ claimantId: userId }, { finderId: userId }],
        },
      }),
      prisma.claim.count({
        where: {
          status: ClaimStatus.COMPLETED,
          OR: [{ claimantId: userId }, { finderId: userId }],
        },
      }),
    ]);

    // Count distinct matches involving the user
    const myMatchesCount = await prisma.match.count({
      where: {
        OR: [{ lostReport: { userId } }, { foundReport: { userId } }],
      },
    });

    // Calculate last 7 days distribution
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);
    const fourteenDaysAgo = new Date(sevenDaysAgo);
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 7);

    const [reports14d, matches14d] = await Promise.all([
      prisma.itemReport.findMany({
        where: { createdAt: { gte: fourteenDaysAgo } },
        select: { createdAt: true },
      }),
      prisma.match.findMany({
        where: { createdAt: { gte: fourteenDaysAgo } },
        select: { createdAt: true },
      }),
    ]);

    const recentReports7d = reports14d.filter(
      (report) => report.createdAt >= sevenDaysAgo,
    );
    const recentMatches7d = matches14d.filter(
      (match) => match.createdAt >= sevenDaysAgo,
    );
    const previousReports7d = reports14d.filter(
      (report) => report.createdAt < sevenDaysAgo,
    );
    const reportCountsByDay = Array(7).fill(0) as number[];
    const matchCountsByDay = Array(7).fill(0) as number[];
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const dayLabels: string[] = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      dayLabels.push(dayNames[d.getDay()]);
    }

    const dayIndex = (createdAt: Date) =>
      6 -
      Math.min(
        6,
        Math.max(
          0,
          Math.floor((now.getTime() - createdAt.getTime()) / 86400000),
        ),
      );
    recentReports7d.forEach(
      (report) => reportCountsByDay[dayIndex(report.createdAt)]++,
    );
    recentMatches7d.forEach(
      (match) => matchCountsByDay[dayIndex(match.createdAt)]++,
    );
    const percentIncrease = previousReports7d.length
      ? Math.round(
          ((recentReports7d.length - previousReports7d.length) /
            previousReports7d.length) *
            100,
        )
      : 0;

    const recentNotifications = await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    return {
      userStats: {
        totalLost: myLostCount,
        totalFound: myFoundCount,
        activeMatches: myMatchesCount,
        resolvedItems: myResolvedCount,
        pendingClaims,
        successfulRecoveries,
      },
      systemStats: {
        totalLost: totalLostCount,
        totalFound: totalFoundCount,
        totalMatches: totalMatchesCount,
        totalResolved: totalResolvedCount,
      },
      weeklyTrends: {
        days: dayLabels,
        reports: reportCountsByDay,
        matches: matchCountsByDay,
        percentIncrease,
      },
      recentNotifications,
    };
  }

  static async getRecentActivity(userId: string) {
    const recentReports = await prisma.itemReport.findMany({
      where: { userId },
      include: {
        category: true,
        _count: {
          select: {
            lostMatches: true,
            foundMatches: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    const recentMatches = await prisma.match.findMany({
      where: {
        OR: [{ lostReport: { userId } }, { foundReport: { userId } }],
      },
      include: {
        lostReport: {
          include: { category: true },
        },
        foundReport: {
          include: { category: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    const recentNotifications = await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    return {
      recentReports: recentReports.map((r) => ({
        ...r,
        matchesCount: r._count.lostMatches + r._count.foundMatches,
      })),
      recentMatches,
      recentNotifications,
    };
  }
}
