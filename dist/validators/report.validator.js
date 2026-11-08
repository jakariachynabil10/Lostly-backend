"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateReportSchema = exports.createReportSchema = void 0;
const zod_1 = require("zod");
const client_1 = require("@prisma/client");
exports.createReportSchema = zod_1.z.object({
    type: zod_1.z.nativeEnum(client_1.ReportType, {
        errorMap: () => ({ message: "Type must be either LOST or FOUND" }),
    }),
    categoryId: zod_1.z.string().min(1, "Category is required"),
    itemName: zod_1.z.string().min(2, "Item name must be at least 2 characters").max(100),
    brand: zod_1.z.string().max(100).optional().nullable(),
    color: zod_1.z.string().max(50).optional().nullable(),
    description: zod_1.z.string().min(5, "Description must be at least 5 characters").max(2000),
    location: zod_1.z.string().min(2, "Location is required").max(200),
    date: zod_1.z.string().refine((val) => !isNaN(Date.parse(val)), {
        message: "Invalid date format",
    }),
    approximateTime: zod_1.z.string().max(50).optional().nullable(),
    imageUrl: zod_1.z.string().optional().nullable(),
    identifyingFeatures: zod_1.z.string().max(1000).optional().nullable(),
});
exports.updateReportSchema = zod_1.z.object({
    categoryId: zod_1.z.string().min(1).optional(),
    itemName: zod_1.z.string().min(2).max(100).optional(),
    brand: zod_1.z.string().max(100).optional().nullable(),
    color: zod_1.z.string().max(50).optional().nullable(),
    description: zod_1.z.string().min(5).max(2000).optional(),
    location: zod_1.z.string().min(2).max(200).optional(),
    date: zod_1.z.string().refine((val) => !isNaN(Date.parse(val)), {
        message: "Invalid date format",
    }).optional(),
    approximateTime: zod_1.z.string().max(50).optional().nullable(),
    imageUrl: zod_1.z.string().optional().nullable(),
    identifyingFeatures: zod_1.z.string().max(1000).optional().nullable(),
    status: zod_1.z.nativeEnum(client_1.ReportStatus).optional(),
});
