import { ClaimStatus } from "@prisma/client";
import { z } from "zod";

export const createClaimSchema = z.object({
  matchId: z.string().trim().min(1).max(100),
});

export const claimIdParamSchema = z.object({
  id: z.string().trim().min(1).max(100),
});

export const getClaimsQuerySchema = z.object({
  role: z.enum(["claimant", "finder"]).optional(),
  status: z.nativeEnum(ClaimStatus).optional(),
  page: z.coerce.number().int().min(1).default(1),
});

export const claimActionSchema = z.object({
  action: z.enum(["approve", "reject", "cancel", "complete"]),
  reviewNotes: z.string().trim().max(1000).optional(),
});
