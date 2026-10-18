import { NextFunction, Response } from "express";
import { AuthenticatedRequest } from "../types";
import { ClaimService } from "../services/claim.service";

export class ClaimController {
  static async create(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const claim = await ClaimService.createClaim(req.user!.id, req.body);
      res.status(201).json({ success: true, data: claim });
    } catch (error) {
      next(error);
    }
  }

  static async list(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { role, status, page } = req.query as {
        role?: "claimant" | "finder";
        status?: Parameters<typeof ClaimService.getClaims>[1] extends infer T
          ? T extends { status?: infer S }
            ? S
            : never
          : never;
        page?: number;
      };
      const result = await ClaimService.getClaims(req.user!.id, {
        role,
        status,
        page,
      });
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  static async getById(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const claim = await ClaimService.getClaimById(
        req.params.id,
        req.user!.id,
      );
      res.json({ success: true, data: claim });
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
      const claim = await ClaimService.handleClaimAction(
        req.params.id,
        req.user!.id,
        req.body,
      );
      res.json({ success: true, data: claim });
    } catch (error) {
      next(error);
    }
  }
}
