import { Request, Response, NextFunction } from "express";
import { ReportService } from "../services/report.service";
import { AuthenticatedRequest } from "../types";
import { processUploadedFile } from "../middleware/upload.middleware";
import { ReportType, ReportStatus } from "@prisma/client";

export class ReportController {
  static async create(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      if (!req.user) {
        res
          .status(401)
          .json({ success: false, message: "Unauthorized", errors: [] });
        return;
      }

      const result = await ReportService.createReport(req.user.id, req.body);
      res.status(201).json({
        success: true,
        message: "Report submitted successfully",
        data: result.report,
        matchesFound: result.matchesCount,
      });
    } catch (error) {
      next(error);
    }
  }

  static async uploadImage(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.file) {
        res
          .status(400)
          .json({
            success: false,
            message: "No image file uploaded",
            errors: [],
          });
        return;
      }

      const imageUrl = await processUploadedFile(req.file, req);
      res.json({
        success: true,
        data: { imageUrl },
      });
    } catch (error) {
      next(error);
    }
  }

  static async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        type,
        categoryId,
        status,
        search,
        location,
        color,
        startDate,
        endDate,
        page,
        limit,
        sortBy,
        sortOrder,
      } = req.query;

      const result = await ReportService.getReports({
        type: type ? (type as ReportType) : undefined,
        categoryId: categoryId ? String(categoryId) : undefined,
        status: status ? (status as ReportStatus) : undefined,
        search: search ? String(search) : undefined,
        location: location ? String(location) : undefined,
        color: color ? String(color) : undefined,
        startDate: startDate ? new Date(String(startDate)) : undefined,
        endDate: endDate ? new Date(String(endDate)) : undefined,
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 12,
        sortBy: (sortBy as any) || "createdAt",
        sortOrder: (sortOrder as any) || "desc",
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const result = await ReportService.getReportById(id);
      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  static async update(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      if (!req.user) {
        res
          .status(401)
          .json({ success: false, message: "Unauthorized", errors: [] });
        return;
      }
      const { id } = req.params;
      const updated = await ReportService.updateReport(
        id,
        req.user.id,
        req.body,
      );
      res.json({
        success: true,
        message: "Report updated successfully",
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }

  static async delete(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      if (!req.user) {
        res
          .status(401)
          .json({ success: false, message: "Unauthorized", errors: [] });
        return;
      }
      const { id } = req.params;
      await ReportService.deleteReport(id, req.user.id);
      res.json({
        success: true,
        message: "Report deleted successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  static async getMyReports(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      if (!req.user) {
        res
          .status(401)
          .json({ success: false, message: "Unauthorized", errors: [] });
        return;
      }
      const { type, status } = req.query;
      const reports = await ReportService.getUserReports(
        req.user.id,
        type ? (type as ReportType) : undefined,
        status ? (status as ReportStatus) : undefined,
      );
      res.json({
        success: true,
        data: reports,
      });
    } catch (error) {
      next(error);
    }
  }
}
