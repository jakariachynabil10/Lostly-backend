"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
function errorHandler(err, _req, res, _next) {
    const meta = err.meta;
    const target = meta?.target;
    const isActiveClaimDuplicate = err.code === "P2002" &&
        (String(meta?.constraint || "").includes("unique_active_claim_per_match_claimant") ||
            String(target || "").includes("unique_active_claim_per_match_claimant") ||
            (Array.isArray(target) &&
                target.includes("matchId") &&
                target.includes("claimantId")));
    const targetFields = Array.isArray(target)
        ? target.join(",")
        : String(target || "");
    const isAnsweredQuestionDuplicate = err.code === "P2002" &&
        (String(meta?.constraint || "").includes("VerificationAnswer_questionId_key") ||
            targetFields.includes("VerificationAnswer_questionId_key") ||
            targetFields === "questionId");
    const statusCode = isActiveClaimDuplicate || isAnsweredQuestionDuplicate
        ? 409
        : err.statusCode || 500;
    const message = statusCode >= 500
        ? "Internal server error"
        : isActiveClaimDuplicate
            ? "You already have an active claim for this match."
            : isAnsweredQuestionDuplicate
                ? "This question has already been answered."
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
