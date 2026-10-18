import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../types";
import { NotificationService } from "../services/notification.service";

export class NotificationController {
  static async getNotifications(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const userId = req.user!.id;
      const { page, limit } = req.query as any;

      const result = await NotificationService.getUserNotifications(userId, {
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 15,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getUnreadCount(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const userId = req.user!.id;
      const result = await NotificationService.getUnreadCount(userId);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  static async markAsRead(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const userId = req.user!.id;
      const { id } = req.params;

      const updated = await NotificationService.markAsRead(id, userId);

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
    } catch (error) {
      next(error);
    }
  }

  static async markAllAsRead(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const userId = req.user!.id;
      const result = await NotificationService.markAllAsRead(userId);

      res.json({
        success: true,
        message: "All notifications marked as read",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}
