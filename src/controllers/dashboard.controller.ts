import { Response, NextFunction } from "express";
import { DashboardService } from "../services/dashboard.service";
import { AuthenticatedRequest } from "../types";

export class DashboardController {
  static async getStats(
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
      const stats = await DashboardService.getStats(req.user.id);
      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getRecentActivity(
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
      const activity = await DashboardService.getRecentActivity(req.user.id);
      res.json({
        success: true,
        data: activity,
      });
    } catch (error) {
      next(error);
    }
  }
}
