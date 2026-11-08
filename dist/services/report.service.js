"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReportService = void 0;
const prisma_1 = require("../prisma");
const client_1 = require("@prisma/client");
const matching_service_1 = require("./matching.service");
const notification_service_1 = require("./notification.service");
class ReportService {
    static async createReport(userId, data) {
        const category = await prisma_1.prisma.category.findUnique({
            where: { id: data.categoryId },
        });
        if (!category) {
            const error = new Error("Invalid category selected");
            error.statusCode = 400;
            throw error;
        }
        const report = await prisma_1.prisma.itemReport.create({
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
                status: client_1.ReportStatus.ACTIVE,
            },
            include: {
                category: true,
                user: {
                    select: { id: true, name: true },
                },
            },
        });
        // Run matching engine asynchronously or synchronously
        const matches = await matching_service_1.MatchingService.runMatchingForReport(report.id);
        // Notify both lost and found owners for matches of 75% or higher
        for (const match of matches) {
            if (match.similarityScore >= 75) {
                const lostReportOwner = match.lostReport?.userId;
                const foundReportOwner = match.foundReport?.userId;
                const lostItemName = match.lostReport?.itemName || report.itemName;
                const foundItemName = match.foundReport?.itemName || report.itemName;
                const scorePct = Math.round(match.similarityScore);
                if (lostReportOwner) {
                    await notification_service_1.NotificationService.createNotification({
                        userId: lostReportOwner,
                        type: client_1.NotificationType.MATCH_FOUND,
                        title: `High Confidence Match Found (${scorePct}%)`,
                        message: `A found item "${foundItemName}" matches your lost "${lostItemName}" with ${scorePct}% similarity.`,
                        link: `/items/${match.lostReport?.id || report.id}`,
                    });
                }
                if (foundReportOwner && foundReportOwner !== lostReportOwner) {
                    await notification_service_1.NotificationService.createNotification({
                        userId: foundReportOwner,
                        type: client_1.NotificationType.MATCH_FOUND,
                        title: `High Confidence Match Found (${scorePct}%)`,
                        message: `A lost report for "${lostItemName}" matches your found "${foundItemName}" with ${scorePct}% similarity.`,
                        link: `/items/${match.foundReport?.id || report.id}`,
                    });
                }
            }
        }
        return {
            report,
            matchesCount: matches.length,
        };
    }
    static async getReports(filters) {
        const page = Math.max(1, Number(filters.page) || 1);
        const limit = Math.max(1, Math.min(100, Number(filters.limit) || 12));
        const skip = (page - 1) * limit;
        const where = {};
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
            prisma_1.prisma.itemReport.findMany({
                where,
                include: {
                    category: true,
                    user: {
                        select: { id: true, name: true },
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
            prisma_1.prisma.itemReport.count({ where }),
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
    static async getReportById(id) {
        const report = await prisma_1.prisma.itemReport.findUnique({
            where: { id },
            include: {
                category: true,
                user: {
                    select: { id: true, name: true, profileImage: true },
                },
            },
        });
        if (!report) {
            const error = new Error("Report not found");
            error.statusCode = 404;
            throw error;
        }
        const matches = await matching_service_1.MatchingService.getMatchesForReport(id);
        return {
            report,
            matches,
        };
    }
    static async updateReport(id, userId, data) {
        const existing = await prisma_1.prisma.itemReport.findUnique({
            where: { id },
        });
        if (!existing) {
            const error = new Error("Report not found");
            error.statusCode = 404;
            throw error;
        }
        if (existing.userId !== userId) {
            const error = new Error("Unauthorized to edit this report");
            error.statusCode = 403;
            throw error;
        }
        const updated = await prisma_1.prisma.itemReport.update({
            where: { id },
            data: {
                ...(data.itemName && { itemName: data.itemName.trim() }),
                ...(data.categoryId && { categoryId: data.categoryId }),
                ...(data.brand !== undefined && {
                    brand: data.brand ? data.brand.trim() : null,
                }),
                ...(data.color !== undefined && {
                    color: data.color ? data.color.trim() : null,
                }),
                ...(data.description && { description: data.description.trim() }),
                ...(data.location && { location: data.location.trim() }),
                ...(data.date && { date: new Date(data.date) }),
                ...(data.approximateTime !== undefined && {
                    approximateTime: data.approximateTime,
                }),
                ...(data.imageUrl !== undefined && { imageUrl: data.imageUrl }),
                ...(data.identifyingFeatures !== undefined && {
                    identifyingFeatures: data.identifyingFeatures
                        ? data.identifyingFeatures.trim()
                        : null,
                }),
                ...(data.status && { status: data.status }),
            },
            include: {
                category: true,
                user: {
                    select: { id: true, name: true },
                },
            },
        });
        // Re-run matching after edit if still active or matched
        if (updated.status !== client_1.ReportStatus.RESOLVED &&
            updated.status !== client_1.ReportStatus.CLOSED) {
            await matching_service_1.MatchingService.runMatchingForReport(updated.id);
        }
        return updated;
    }
    static async deleteReport(id, userId) {
        const existing = await prisma_1.prisma.itemReport.findUnique({
            where: { id },
        });
        if (!existing) {
            const error = new Error("Report not found");
            error.statusCode = 404;
            throw error;
        }
        if (existing.userId !== userId) {
            const error = new Error("Unauthorized to delete this report");
            error.statusCode = 403;
            throw error;
        }
        await prisma_1.prisma.itemReport.delete({
            where: { id },
        });
        return { success: true };
    }
    static async getUserReports(userId, type, status) {
        const where = { userId };
        if (type)
            where.type = type;
        if (status)
            where.status = status;
        const reports = await prisma_1.prisma.itemReport.findMany({
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
exports.ReportService = ReportService;
