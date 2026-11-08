"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationController = void 0;
const notification_service_1 = require("../services/notification.service");
class NotificationController {
    static async getNotifications(req, res, next) {
        try {
            const userId = req.user.id;
            const { page, limit } = req.query;
            const result = await notification_service_1.NotificationService.getUserNotifications(userId, {
                page: page ? Number(page) : 1,
                limit: limit ? Number(limit) : 15,
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
    static async getUnreadCount(req, res, next) {
        try {
            const userId = req.user.id;
            const result = await notification_service_1.NotificationService.getUnreadCount(userId);
            res.json({
                success: true,
                data: result,
            });
        }
        catch (error) {
            next(error);
        }
    }
    static async markAsRead(req, res, next) {
        try {
            const userId = req.user.id;
            const { id } = req.params;
            const updated = await notification_service_1.NotificationService.markAsRead(id, userId);
            if (!updated) {
                res.status(404).json({
                    success: false,
                    message: "Notification not found",
                    errors: [],
                });
                return;
            }
            res.json({
                success: true,
                message: "Notification marked as read",
                data: updated,
            });
        }
        catch (error) {
            next(error);
        }
    }
    static async markAllAsRead(req, res, next) {
        try {
            const userId = req.user.id;
            const result = await notification_service_1.NotificationService.markAllAsRead(userId);
            res.json({
                success: true,
                message: "All notifications marked as read",
                data: result,
            });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.NotificationController = NotificationController;
