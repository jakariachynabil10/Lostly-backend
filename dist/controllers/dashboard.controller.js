"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DashboardController = void 0;
const dashboard_service_1 = require("../services/dashboard.service");
class DashboardController {
    static async getStats(req, res, next) {
        try {
            if (!req.user) {
                res
                    .status(401)
                    .json({ success: false, message: "Unauthorized", errors: [] });
                return;
            }
            const stats = await dashboard_service_1.DashboardService.getStats(req.user.id);
            res.json({
                success: true,
                data: stats,
            });
        }
        catch (error) {
            next(error);
        }
    }
    static async getRecentActivity(req, res, next) {
        try {
            if (!req.user) {
                res
                    .status(401)
                    .json({ success: false, message: "Unauthorized", errors: [] });
                return;
            }
            const activity = await dashboard_service_1.DashboardService.getRecentActivity(req.user.id);
            res.json({
                success: true,
                data: activity,
            });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.DashboardController = DashboardController;
