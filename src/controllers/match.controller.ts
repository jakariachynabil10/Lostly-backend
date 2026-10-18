import { Request, Response, NextFunction } from "express";
import { MatchingService } from "../services/matching.service";
import { AuthenticatedRequest } from "../types";

export class MatchController {
  static async getMatchesForReport(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { reportId } = req.params;
      const matches = await MatchingService.getMatchesForReport(
        reportId,
        (req as AuthenticatedRequest).user?.id,
      );
      res.json({
        success: true,
        data: matches,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getMyMatches(
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
      const matches = await MatchingService.getUserMatches(req.user.id);
      res.json({
        success: true,
        data: matches,
      });
    } catch (error) {
      next(error);
    }
  }

  static async triggerMatching(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { reportId } = req.params;
      const matches = await MatchingService.runMatchingForReport(reportId);
      res.json({
        success: true,
        message: `Matching process completed. Found ${matches.length} matches.`,
        data: matches,
      });
    } catch (error) {
      next(error);
    }
  }
}
