"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReportController = void 0;
const report_service_1 = require("../services/report.service");
const upload_middleware_1 = require("../middleware/upload.middleware");
class ReportController {
    static async create(req, res, next) {
        try {
            if (!req.user) {
                res
                    .status(401)
                    .json({ success: false, message: "Unauthorized", errors: [] });
                return;
            }
            const result = await report_service_1.ReportService.createReport(req.user.id, req.body);
            res.status(201).json({
                success: true,
                message: "Report submitted successfully",
                data: result.report,
                matchesFound: result.matchesCount,
            });
        }
        catch (error) {
            next(error);
        }
    }
    static async uploadImage(req, res, next) {
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
            const imageUrl = await (0, upload_middleware_1.processUploadedFile)(req.file, req);
            res.json({
                success: true,
                data: { imageUrl },
            });
        }
        catch (error) {
            next(error);
        }
    }
    static async getAll(req, res, next) {
        try {
            const { type, categoryId, status, search, location, color, startDate, endDate, page, limit, sortBy, sortOrder, } = req.query;
            const result = await report_service_1.ReportService.getReports({
                type: type ? type : undefined,
                categoryId: categoryId ? String(categoryId) : undefined,
                status: status ? status : undefined,
                search: search ? String(search) : undefined,
                location: location ? String(location) : undefined,
                color: color ? String(color) : undefined,
                startDate: startDate ? new Date(String(startDate)) : undefined,
                endDate: endDate ? new Date(String(endDate)) : undefined,
                page: page ? Number(page) : 1,
                limit: limit ? Number(limit) : 12,
                sortBy: sortBy || "createdAt",
                sortOrder: sortOrder || "desc",
            });
            res.json({
                success: true,
                data: result,
            });
        }
        catch (error) {
            next(error);
        }
    }
    static async getById(req, res, next) {
        try {
            const { id } = req.params;
            const result = await report_service_1.ReportService.getReportById(id);
            res.json({
                success: true,
                data: result,
            });
        }
        catch (error) {
            next(error);
        }
    }
    static async update(req, res, next) {
        try {
            if (!req.user) {
                res
                    .status(401)
                    .json({ success: false, message: "Unauthorized", errors: [] });
                return;
            }
            const { id } = req.params;
            const updated = await report_service_1.ReportService.updateReport(id, req.user.id, req.body);
            res.json({
                success: true,
                message: "Report updated successfully",
                data: updated,
            });
        }
        catch (error) {
            next(error);
        }
    }
    static async delete(req, res, next) {
        try {
            if (!req.user) {
                res
                    .status(401)
                    .json({ success: false, message: "Unauthorized", errors: [] });
                return;
            }
            const { id } = req.params;
            await report_service_1.ReportService.deleteReport(id, req.user.id);
            res.json({
                success: true,
                message: "Report deleted successfully",
            });
        }
        catch (error) {
            next(error);
        }
    }
    static async getMyReports(req, res, next) {
        try {
            if (!req.user) {
                res
                    .status(401)
                    .json({ success: false, message: "Unauthorized", errors: [] });
                return;
            }
            const { type, status } = req.query;
            const reports = await report_service_1.ReportService.getUserReports(req.user.id, type ? type : undefined, status ? status : undefined);
            res.json({
                success: true,
                data: reports,
            });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.ReportController = ReportController;
