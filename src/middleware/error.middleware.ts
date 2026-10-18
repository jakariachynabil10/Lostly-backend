import { Request, Response, NextFunction } from "express";

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
  errors?: any;
}

export function errorHandler(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const meta = (err as any).meta;
  const target = meta?.target;
  const isActiveClaimDuplicate =
    err.code === "P2002" &&
    (String(meta?.constraint || "").includes(
      "unique_active_claim_per_match_claimant",
    ) ||
      String(target || "").includes("unique_active_claim_per_match_claimant") ||
      (Array.isArray(target) &&
        target.includes("matchId") &&
        target.includes("claimantId")));
  const statusCode = isActiveClaimDuplicate ? 409 : err.statusCode || 500;
  const message = isActiveClaimDuplicate
    ? "You already have an active claim for this match."
    : err.message || "Internal server error";

  if (statusCode >= 500) {
    console.error("Unhandled request error:", { statusCode, code: err.code });
  }

  res.status(statusCode).json({
    success: false,
    message,
    errors: Array.isArray(err.errors) ? err.errors : [],
  });
}
