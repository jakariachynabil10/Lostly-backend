"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MatchController = void 0;
const matching_service_1 = require("../services/matching.service");
class MatchController {
    static async getMatchesForReport(req, res, next) {
        try {
            const { reportId } = req.params;
            const matches = await matching_service_1.MatchingService.getMatchesForReport(reportId, req.user?.id);
            res.json({
                success: true,
                data: matches,
            });
        }
        catch (error) {
            next(error);
        }
    }
    static async getMyMatches(req, res, next) {
        try {
            if (!req.user) {
                res
                    .status(401)
                    .json({ success: false, message: "Unauthorized", errors: [] });
                return;
            }
            const matches = await matching_service_1.MatchingService.getUserMatches(req.user.id);
            res.json({
                success: true,
                data: matches,
            });
        }
        catch (error) {
            next(error);
        }
    }
    static async triggerMatching(req, res, next) {
        try {
            const { reportId } = req.params;
            const matches = await matching_service_1.MatchingService.runMatchingForReport(reportId);
            res.json({
                success: true,
                message: `Matching process completed. Found ${matches.length} matches.`,
                data: matches,
            });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.MatchController = MatchController;
