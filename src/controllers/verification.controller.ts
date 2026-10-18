import { NextFunction, Response } from "express";
import { VerificationService } from "../services/verification.service";
import { AuthenticatedRequest } from "../types";

export class VerificationController {
  static async addQuestions(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const questions = await VerificationService.addQuestions(
        req.user!.id,
        req.body.claimId,
        req.body.questions,
      );
      res.status(201).json({ success: true, data: questions });
    } catch (error) {
      next(error);
    }
  }

  static async submitAnswers(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const answers = await VerificationService.submitAnswers(
        req.user!.id,
        req.body.answers,
      );
      res.status(201).json({ success: true, data: answers });
    } catch (error) {
      next(error);
    }
  }

  static async reviewAnswer(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const answer = await VerificationService.reviewAnswer(
        req.user!.id,
        req.params.id,
        req.body.reviewStatus,
      );
      res.json({ success: true, data: answer });
    } catch (error) {
      next(error);
    }
  }
}
