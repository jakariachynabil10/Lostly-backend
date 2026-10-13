import { prisma } from "../prisma";
import { calculateReportSimilarity } from "../utils/similarity";
import { ReportType, ReportStatus } from "@prisma/client";

export class MatchingService {
  static async runMatchingForReport(reportId: string) {
    const report = await prisma.itemReport.findUnique({
      where: { id: reportId },
      include: { category: true },
    });

    if (!report || report.status === ReportStatus.RESOLVED || report.status === ReportStatus.CLOSED) {
      return [];
    }

    const oppositeType = report.type === ReportType.LOST ? ReportType.FOUND : ReportType.LOST;

    // Fetch candidate reports of opposite type
    const candidates = await prisma.itemReport.findMany({
      where: {
        type: oppositeType,
        status: { in: [ReportStatus.ACTIVE, ReportStatus.MATCH_FOUND] },
      },
      include: {
        category: true,
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    const newMatches = [];

    for (const candidate of candidates) {
      const lostReport = report.type === ReportType.LOST ? report : candidate;
      const foundReport = report.type === ReportType.FOUND ? report : candidate;

      const result = calculateReportSimilarity(
        {
          itemName: lostReport.itemName,
          categoryId: lostReport.categoryId,
          categoryName: lostReport.category.name,
          brand: lostReport.brand,
          color: lostReport.color,
          description: lostReport.description,
          identifyingFeatures: lostReport.identifyingFeatures,
          location: lostReport.location,
          date: lostReport.date,
          imageUrl: lostReport.imageUrl,
        },
        {
          itemName: foundReport.itemName,
          categoryId: foundReport.categoryId,
          categoryName: foundReport.category.name,
          brand: foundReport.brand,
          color: foundReport.color,
          description: foundReport.description,
          identifyingFeatures: foundReport.identifyingFeatures,
          location: foundReport.location,
          date: foundReport.date,
          imageUrl: foundReport.imageUrl,
        }
      );

      // Threshold: >= 60% is considered a possible/strong match
      if (result.similarityScore >= 60) {
        const savedMatch = await prisma.match.upsert({
          where: {
            lostReportId_foundReportId: {
              lostReportId: lostReport.id,
              foundReportId: foundReport.id,
            },
          },
          update: {
            similarityScore: result.similarityScore,
            matchingFactors: result.matchingFactors as any,
          },
          create: {
            lostReportId: lostReport.id,
            foundReportId: foundReport.id,
            similarityScore: result.similarityScore,
            matchingFactors: result.matchingFactors as any,
          },
        });

        // Update status of reports if still ACTIVE
        if (lostReport.status === ReportStatus.ACTIVE) {
          await prisma.itemReport.update({
            where: { id: lostReport.id },
            data: { status: ReportStatus.MATCH_FOUND },
          });
        }
        if (foundReport.status === ReportStatus.ACTIVE) {
          await prisma.itemReport.update({
            where: { id: foundReport.id },
            data: { status: ReportStatus.MATCH_FOUND },
          });
        }

        newMatches.push(savedMatch);
      }
    }

    return newMatches;
  }

  static async getMatchesForReport(reportId: string) {
    const matches = await prisma.match.findMany({
      where: {
        OR: [{ lostReportId: reportId }, { foundReportId: reportId }],
      },
      include: {
        lostReport: {
          include: {
            category: true,
            user: { select: { id: true, name: true, email: true } },
          },
        },
        foundReport: {
          include: {
            category: true,
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
      orderBy: {
        similarityScore: "desc",
      },
    });

    return matches.map((m) => {
      const isTargetLost = m.lostReportId === reportId;
      const counterpart = isTargetLost ? m.foundReport : m.lostReport;

      return {
        id: m.id,
        similarityScore: m.similarityScore,
        matchingFactors: m.matchingFactors,
        createdAt: m.createdAt,
        counterpartType: counterpart.type,
        counterpart: {
          id: counterpart.id,
          itemName: counterpart.itemName,
          brand: counterpart.brand,
          color: counterpart.color,
          category: counterpart.category,
          location: counterpart.location,
          date: counterpart.date,
          imageUrl: counterpart.imageUrl,
          description: counterpart.description,
          identifyingFeatures: counterpart.identifyingFeatures,
          status: counterpart.status,
          user: counterpart.user,
        },
      };
    });
  }

  static async getUserMatches(userId: string) {
    const matches = await prisma.match.findMany({
      where: {
        OR: [
          { lostReport: { userId } },
          { foundReport: { userId } },
        ],
      },
      include: {
        lostReport: {
          include: {
            category: true,
            user: { select: { id: true, name: true, email: true } },
          },
        },
        foundReport: {
          include: {
            category: true,
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
      orderBy: {
        similarityScore: "desc",
      },
      take: 50,
    });

    return matches.map((m) => {
      const isUserLost = m.lostReport.userId === userId;
      const myItem = isUserLost ? m.lostReport : m.foundReport;
      const matchedItem = isUserLost ? m.foundReport : m.lostReport;

      return {
        id: m.id,
        similarityScore: m.similarityScore,
        matchingFactors: m.matchingFactors,
        createdAt: m.createdAt,
        myItem: {
          id: myItem.id,
          itemName: myItem.itemName,
          type: myItem.type,
          imageUrl: myItem.imageUrl,
          status: myItem.status,
          location: myItem.location,
          date: myItem.date,
        },
        matchedItem: {
          id: matchedItem.id,
          itemName: matchedItem.itemName,
          type: matchedItem.type,
          imageUrl: matchedItem.imageUrl,
          status: matchedItem.status,
          location: matchedItem.location,
          date: matchedItem.date,
          user: matchedItem.user,
        },
      };
    });
  }
}
