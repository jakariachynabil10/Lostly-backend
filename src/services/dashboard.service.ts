import { prisma } from "../prisma";
import { ReportType, ReportStatus } from "@prisma/client";

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
    ] = await Promise.all([
      prisma.itemReport.count({ where: { userId, type: ReportType.LOST } }),
      prisma.itemReport.count({ where: { userId, type: ReportType.FOUND } }),
      prisma.itemReport.count({ where: { userId, status: ReportStatus.RESOLVED } }),
      prisma.itemReport.count({ where: { type: ReportType.LOST } }),
      prisma.itemReport.count({ where: { type: ReportType.FOUND } }),
      prisma.match.count(),
      prisma.itemReport.count({ where: { status: ReportStatus.RESOLVED } }),
    ]);

    // Count distinct matches involving the user
    const myMatchesCount = await prisma.match.count({
      where: {
        OR: [{ lostReport: { userId } }, { foundReport: { userId } }],
      },
    });

    return {
      userStats: {
        totalLost: myLostCount,
        totalFound: myFoundCount,
        activeMatches: myMatchesCount,
        resolvedItems: myResolvedCount,
      },
      systemStats: {
        totalLost: totalLostCount,
        totalFound: totalFoundCount,
        totalMatches: totalMatchesCount,
        totalResolved: totalResolvedCount,
      },
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

    return {
      recentReports: recentReports.map((r) => ({
        ...r,
        matchesCount: r._count.lostMatches + r._count.foundMatches,
      })),
      recentMatches,
    };
  }
}
