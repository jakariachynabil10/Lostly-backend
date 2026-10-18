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
});
