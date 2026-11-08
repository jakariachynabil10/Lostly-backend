"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VerificationController = void 0;
const verification_service_1 = require("../services/verification.service");
class VerificationController {
    static async addQuestions(req, res, next) {
        try {
            const questions = await verification_service_1.VerificationService.addQuestions(req.user.id, req.body.claimId, req.body.questions);
            res.status(201).json({ success: true, data: questions });
        }
        catch (error) {
            next(error);
        }
    }
    static async submitAnswers(req, res, next) {
        try {
            const answers = await verification_service_1.VerificationService.submitAnswers(req.user.id, req.body.answers);
            res.status(201).json({ success: true, data: answers });
        }
        catch (error) {
            next(error);
        }
    }
    static async reviewAnswer(req, res, next) {
        try {
            const answer = await verification_service_1.VerificationService.reviewAnswer(req.user.id, req.params.id, req.body.reviewStatus);
            res.json({ success: true, data: answer });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.VerificationController = VerificationController;
