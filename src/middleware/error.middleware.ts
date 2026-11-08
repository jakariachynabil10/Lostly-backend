import { Request, Response, NextFunction } from "express";

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
  errors?: any;
  retryAfterSeconds?: number;
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
  const targetFields = Array.isArray(target)
    ? target.join(",")
    : String(target || "");
  const isAnsweredQuestionDuplicate =
    err.code === "P2002" &&
    (String(meta?.constraint || "").includes(
      "VerificationAnswer_questionId_key",
    ) ||
      targetFields.includes("VerificationAnswer_questionId_key") ||
      targetFields === "questionId");
  const statusCode =
    isActiveClaimDuplicate || isAnsweredQuestionDuplicate
      ? 409
      : err.statusCode || 500;
  const message =
    statusCode === 503 && err.code === "EMAIL_DELIVERY_UNAVAILABLE"
      ? err.message
      : statusCode >= 500
      ? "Internal server error"
      : isActiveClaimDuplicate
        ? "You already have an active claim for this match."
        : isAnsweredQuestionDuplicate
          ? "This question has already been answered."
          : err.message || "Internal server error";

  if (statusCode >= 500) {
    console.error("Unhandled request error:", { statusCode, code: err.code });
  }

  const response: {
    success: false;
    message: string;
    code?: string;
    errors: any[];
    retryAfterSeconds?: number;
  } = {
    success: false,
    message,
    errors: Array.isArray(err.errors) ? err.errors : [],
  };
  if (
    err.code === "EMAIL_NOT_VERIFIED" ||
    err.code === "EMAIL_DELIVERY_UNAVAILABLE" ||
    err.code === "RATE_LIMITED" ||
    err.code === "TOO_MANY_ATTEMPTS"
  ) {
    response.code = err.code;
  }
  if (err.retryAfterSeconds !== undefined) {
    response.retryAfterSeconds = err.retryAfterSeconds;
  }
  res.status(statusCode).json(response);
}
