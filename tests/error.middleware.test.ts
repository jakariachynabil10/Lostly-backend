import { describe, expect, it, vi } from "vitest";
import { errorHandler } from "../src/middleware/error.middleware";

describe("errorHandler", () => {
  it("maps the active-claim unique index to the stable 409 error shape", () => {
    const error = Object.assign(new Error("Unique constraint failed"), {
      code: "P2002",
      meta: { target: "unique_active_claim_per_match_claimant" },
    });
    const response = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    errorHandler(error, {} as any, response as any, vi.fn() as any);

    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.json).toHaveBeenCalledWith({
      success: false,
      message: "You already have an active claim for this match.",
      errors: [],
    });
  });

  it("maps a duplicate answer for one question to its stable 409 response", () => {
    const error = Object.assign(new Error("Unique constraint failed"), {
      code: "P2002",
      meta: { target: ["questionId"] },
    });
    const response = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    errorHandler(error, {} as any, response as any, vi.fn() as any);

    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.json).toHaveBeenCalledWith({
      success: false,
      message: "This question has already been answered.",
      errors: [],
    });
  });

  it("hides internal error messages in 500 responses", () => {
    const response = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    errorHandler(
      new Error("database password or query details"),
      {} as any,
      response as any,
      vi.fn() as any,
    );

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      success: false,
      message: "Internal server error",
      errors: [],
    });
  });
});
