import { z } from "zod";
import { ReportType, ReportStatus } from "@prisma/client";

export const createReportSchema = z.object({
  type: z.nativeEnum(ReportType, {
    errorMap: () => ({ message: "Type must be either LOST or FOUND" }),
  }),
  categoryId: z.string().min(1, "Category is required"),
  itemName: z.string().min(2, "Item name must be at least 2 characters").max(100),
  brand: z.string().max(100).optional().nullable(),
  color: z.string().max(50).optional().nullable(),
  description: z.string().min(5, "Description must be at least 5 characters").max(2000),
  location: z.string().min(2, "Location is required").max(200),
  date: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Invalid date format",
  }),
  approximateTime: z.string().max(50).optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  identifyingFeatures: z.string().max(1000).optional().nullable(),
});

export const updateReportSchema = z.object({
  categoryId: z.string().min(1).optional(),
  itemName: z.string().min(2).max(100).optional(),
  brand: z.string().max(100).optional().nullable(),
  color: z.string().max(50).optional().nullable(),
  description: z.string().min(5).max(2000).optional(),
  location: z.string().min(2).max(200).optional(),
  date: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Invalid date format",
  }).optional(),
  approximateTime: z.string().max(50).optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  identifyingFeatures: z.string().max(1000).optional().nullable(),
  status: z.nativeEnum(ReportStatus).optional(),
});
