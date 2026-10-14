import { prisma } from "../prisma";
import { ReportFilterOptions } from "../types";
import { ReportType, ReportStatus, Prisma, NotificationType } from "@prisma/client";
import { AppError } from "../middleware/error.middleware";
import { MatchingService } from "./matching.service";
import { NotificationService } from "./notification.service";

export interface CreateReportDTO {
  type: ReportType;
  categoryId: string;
  itemName: string;
  brand?: string | null;
  color?: string | null;
  description: string;
  location: string;
  date: string | Date;
  approximateTime?: string | null;
  imageUrl?: string | null;
  identifyingFeatures?: string | null;
}

export interface UpdateReportDTO {
  itemName?: string;
  categoryId?: string;
  brand?: string | null;
  color?: string | null;
  description?: string;
  location?: string;
  date?: string | Date;
  approximateTime?: string | null;
  imageUrl?: string | null;
  identifyingFeatures?: string | null;
  status?: ReportStatus;
}

export class ReportService {
  static async createReport(userId: string, data: CreateReportDTO) {
    const category = await prisma.category.findUnique({
      where: { id: data.categoryId },
    });

    if (!category) {
      const error: AppError = new Error("Invalid category selected");
      error.statusCode = 400;
      throw error;
    }

    const report = await prisma.itemReport.create({
      data: {
        userId,
        type: data.type,
        categoryId: data.categoryId,
        itemName: data.itemName.trim(),
        brand: data.brand?.trim() || null,
        color: data.color?.trim() || null,
        description: data.description.trim(),
        location: data.location.trim(),
        date: new Date(data.date),
        approximateTime: data.approximateTime || null,
        imageUrl: data.imageUrl || null,
        identifyingFeatures: data.identifyingFeatures?.trim() || null,
        status: ReportStatus.ACTIVE,
      },
      include: {
        category: true,
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    // Run matching engine asynchronously or synchronously
    const matches = await MatchingService.runMatchingForReport(report.id);

    // Notify both lost and found owners for matches of 75% or higher
    for (const match of matches) {
      if (match.similarityScore >= 75) {
        const lostReportOwner = (match as any).lostReport?.userId;
        const foundReportOwner = (match as any).foundReport?.userId;
        const lostItemName = (match as any).lostReport?.itemName || report.itemName;
        const foundItemName = (match as any).foundReport?.itemName || report.itemName;
        const scorePct = Math.round(match.similarityScore);

        if (lostReportOwner) {
          await NotificationService.createNotification({
            userId: lostReportOwner,
            type: NotificationType.MATCH_FOUND,
            title: `High Confidence Match Found (${scorePct}%)`,
            message: `A found item "${foundItemName}" matches your lost "${lostItemName}" with ${scorePct}% similarity.`,
            link: `/items/${(match as any).lostReport?.id || report.id}`,
          });
        }

        if (foundReportOwner && foundReportOwner !== lostReportOwner) {
          await NotificationService.createNotification({
            userId: foundReportOwner,
            type: NotificationType.MATCH_FOUND,
            title: `High Confidence Match Found (${scorePct}%)`,
            message: `A lost report for "${lostItemName}" matches your found "${foundItemName}" with ${scorePct}% similarity.`,
            link: `/items/${(match as any).foundReport?.id || report.id}`,
          });
        }
      }
    }

    return {
      report,
      matchesCount: matches.length,
    };
  }

  static async getReports(filters: ReportFilterOptions) {
    const page = Math.max(1, Number(filters.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(filters.limit) || 12));
    const skip = (page - 1) * limit;

    const where: Prisma.ItemReportWhereInput = {};

    if (filters.type) {
      where.type = filters.type;
    }

    if (filters.categoryId) {
      where.categoryId = filters.categoryId;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.color) {
      where.color = { contains: filters.color, mode: "insensitive" };
    }

    if (filters.location) {
      where.location = { contains: filters.location, mode: "insensitive" };
    }

    if (filters.startDate || filters.endDate) {
      where.date = {};
      if (filters.startDate) {
        where.date.gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        where.date.lte = new Date(filters.endDate);
      }
    }

    if (filters.search && filters.search.trim()) {
      const term = filters.search.trim();
      where.OR = [
        { itemName: { contains: term, mode: "insensitive" } },
        { brand: { contains: term, mode: "insensitive" } },
        { description: { contains: term, mode: "insensitive" } },
        { location: { contains: term, mode: "insensitive" } },
        { identifyingFeatures: { contains: term, mode: "insensitive" } },
        { category: { name: { contains: term, mode: "insensitive" } } },
      ];
    }

    const [reports, total] = await Promise.all([
      prisma.itemReport.findMany({
        where,
        include: {
          category: true,
          user: {
            select: { id: true, name: true, email: true },
          },
          _count: {
            select: {
              lostMatches: true,
              foundMatches: true,
            },
          },
        },
        orderBy: {
          [filters.sortBy || "createdAt"]: filters.sortOrder || "desc",
        },
        skip,
        take: limit,
      }),
      prisma.itemReport.count({ where }),
    ]);

    return {
      reports: reports.map((r) => ({
        ...r,
        matchesCount: r._count.lostMatches + r._count.foundMatches,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  static async getReportById(id: string) {
    const report = await prisma.itemReport.findUnique({
      where: { id },
      include: {
        category: true,
        user: {
          select: { id: true, name: true, email: true, profileImage: true },
        },
      },
    });

    if (!report) {
      const error: AppError = new Error("Report not found");
      error.statusCode = 404;
      throw error;
    }

    const matches = await MatchingService.getMatchesForReport(id);

    return {
      report,
      matches,
    };
  }

  static async updateReport(id: string, userId: string, data: UpdateReportDTO) {
    const existing = await prisma.itemReport.findUnique({
      where: { id },
    });

    if (!existing) {
      const error: AppError = new Error("Report not found");
      error.statusCode = 404;
      throw error;
    }

    if (existing.userId !== userId) {
      const error: AppError = new Error("Unauthorized to edit this report");
      error.statusCode = 403;
      throw error;
    }

    const updated = await prisma.itemReport.update({
      where: { id },
      data: {
        ...(data.itemName && { itemName: data.itemName.trim() }),
        ...(data.categoryId && { categoryId: data.categoryId }),
        ...(data.brand !== undefined && { brand: data.brand ? data.brand.trim() : null }),
        ...(data.color !== undefined && { color: data.color ? data.color.trim() : null }),
        ...(data.description && { description: data.description.trim() }),
        ...(data.location && { location: data.location.trim() }),
        ...(data.date && { date: new Date(data.date) }),
        ...(data.approximateTime !== undefined && { approximateTime: data.approximateTime }),
        ...(data.imageUrl !== undefined && { imageUrl: data.imageUrl }),
        ...(data.identifyingFeatures !== undefined && {
          identifyingFeatures: data.identifyingFeatures ? data.identifyingFeatures.trim() : null,
        }),
        ...(data.status && { status: data.status }),
      },
      include: {
        category: true,
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    // Re-run matching after edit if still active or matched
    if (updated.status !== ReportStatus.RESOLVED && updated.status !== ReportStatus.CLOSED) {
      await MatchingService.runMatchingForReport(updated.id);
    }

    return updated;
  }

  static async deleteReport(id: string, userId: string) {
    const existing = await prisma.itemReport.findUnique({
      where: { id },
    });

    if (!existing) {
      const error: AppError = new Error("Report not found");
      error.statusCode = 404;
      throw error;
    }

    if (existing.userId !== userId) {
      const error: AppError = new Error("Unauthorized to delete this report");
      error.statusCode = 403;
      throw error;
    }

    await prisma.itemReport.delete({
      where: { id },
    });

    return { success: true };
  }

  static async getUserReports(userId: string, type?: ReportType, status?: ReportStatus) {
    const where: Prisma.ItemReportWhereInput = { userId };
    if (type) where.type = type;
    if (status) where.status = status;

    const reports = await prisma.itemReport.findMany({
      where,
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
    });

    return reports.map((r) => ({
      ...r,
      matchesCount: r._count.lostMatches + r._count.foundMatches,
    }));
  }
}
