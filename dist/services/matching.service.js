"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MatchingService = void 0;
const prisma_1 = require("../prisma");
const similarity_1 = require("../utils/similarity");
const client_1 = require("@prisma/client");
class MatchingService {
    static async runMatchingForReport(reportId) {
        const report = await prisma_1.prisma.itemReport.findUnique({
            where: { id: reportId },
            include: { category: true },
        });
        if (!report ||
            report.status === client_1.ReportStatus.RESOLVED ||
            report.status === client_1.ReportStatus.CLOSED) {
            return [];
        }
        const oppositeType = report.type === client_1.ReportType.LOST ? client_1.ReportType.FOUND : client_1.ReportType.LOST;
        // Fetch candidate reports of opposite type
        const candidates = await prisma_1.prisma.itemReport.findMany({
            where: {
                type: oppositeType,
                status: { in: [client_1.ReportStatus.ACTIVE, client_1.ReportStatus.MATCH_FOUND] },
            },
            include: {
                category: true,
                user: {
                    select: { id: true, name: true },
                },
            },
        });
        const newMatches = [];
        for (const candidate of candidates) {
            const lostReport = report.type === client_1.ReportType.LOST ? report : candidate;
            const foundReport = report.type === client_1.ReportType.FOUND ? report : candidate;
            const result = (0, similarity_1.calculateReportSimilarity)({
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
            }, {
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
            });
            // Threshold: >= 60% is considered a possible/strong match
            if (result.similarityScore >= 60) {
                const savedMatch = await prisma_1.prisma.match.upsert({
                    where: {
                        lostReportId_foundReportId: {
                            lostReportId: lostReport.id,
                            foundReportId: foundReport.id,
                        },
                    },
                    update: {
                        similarityScore: result.similarityScore,
                        matchingFactors: result.matchingFactors,
                    },
                    create: {
                        lostReportId: lostReport.id,
                        foundReportId: foundReport.id,
                        similarityScore: result.similarityScore,
                        matchingFactors: result.matchingFactors,
                    },
                    include: {
                        lostReport: { select: { id: true, userId: true, itemName: true } },
                        foundReport: { select: { id: true, userId: true, itemName: true } },
                    },
                });
                // Update status of reports if still ACTIVE
                if (lostReport.status === client_1.ReportStatus.ACTIVE) {
                    await prisma_1.prisma.itemReport.update({
                        where: { id: lostReport.id },
                        data: { status: client_1.ReportStatus.MATCH_FOUND },
                    });
                }
                if (foundReport.status === client_1.ReportStatus.ACTIVE) {
                    await prisma_1.prisma.itemReport.update({
                        where: { id: foundReport.id },
                        data: { status: client_1.ReportStatus.MATCH_FOUND },
                    });
                }
                newMatches.push(savedMatch);
            }
        }
        return newMatches;
    }
    static async getMatchesForReport(reportId, userId) {
        const matches = await prisma_1.prisma.match.findMany({
            where: {
                OR: [{ lostReportId: reportId }, { foundReportId: reportId }],
            },
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
                claims: {
                    select: { id: true, claimantId: true, finderId: true, status: true },
                },
            },
            orderBy: {
                similarityScore: "desc",
            },
        });
        return matches.map((m) => {
            const isTargetLost = m.lostReportId === reportId;
            const counterpart = isTargetLost ? m.foundReport : m.lostReport;
            const isClaimant = Boolean(userId && m.lostReport.userId === userId);
            const isFinder = Boolean(userId && m.foundReport.userId === userId);
            const activeClaim = isClaimant
                ? m.claims.find((claim) => claim.claimantId === userId &&
                    (claim.status === client_1.ClaimStatus.PENDING ||
                        claim.status === client_1.ClaimStatus.UNDER_REVIEW ||
                        claim.status === client_1.ClaimStatus.APPROVED))
                : undefined;
            return {
                id: m.id,
                similarityScore: m.similarityScore,
                matchingFactors: m.matchingFactors,
                createdAt: m.createdAt,
                ...(isClaimant && {
                    claim: activeClaim ? { id: activeClaim.id, status: activeClaim.status } : null,
                }),
                ...(isFinder && {
                    claimsReceivedCount: m.claims.filter((claim) => claim.finderId === userId).length,
                }),
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
    static async getUserMatches(userId) {
        const matches = await prisma_1.prisma.match.findMany({
            where: {
                OR: [{ lostReport: { userId } }, { foundReport: { userId } }],
            },
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
                claims: {
                    select: { id: true, claimantId: true, finderId: true, status: true },
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
            const activeClaim = isUserLost
                ? m.claims.find((claim) => claim.claimantId === userId &&
                    (claim.status === client_1.ClaimStatus.PENDING ||
                        claim.status === client_1.ClaimStatus.UNDER_REVIEW ||
                        claim.status === client_1.ClaimStatus.APPROVED))
                : undefined;
            return {
                id: m.id,
                similarityScore: m.similarityScore,
                matchingFactors: m.matchingFactors,
                createdAt: m.createdAt,
                ...(isUserLost && {
                    claim: activeClaim ? { id: activeClaim.id, status: activeClaim.status } : null,
                }),
                ...(!isUserLost && {
                    claimsReceivedCount: m.claims.filter((claim) => claim.finderId === userId).length,
                }),
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
exports.MatchingService = MatchingService;
