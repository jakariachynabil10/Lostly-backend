"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.claimActionSchema = exports.getClaimsQuerySchema = exports.claimIdParamSchema = exports.createClaimSchema = void 0;
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
exports.createClaimSchema = zod_1.z.object({
    matchId: zod_1.z.string().trim().min(1).max(100),
});
exports.claimIdParamSchema = zod_1.z.object({
    id: zod_1.z.string().trim().min(1).max(100),
});
exports.getClaimsQuerySchema = zod_1.z.object({
    role: zod_1.z.enum(["claimant", "finder"]).optional(),
    status: zod_1.z.nativeEnum(client_1.ClaimStatus).optional(),
    page: zod_1.z.coerce.number().int().min(1).default(1),
});
exports.claimActionSchema = zod_1.z.object({
    action: zod_1.z.enum(["approve", "reject", "cancel", "complete"]),
    reviewNotes: zod_1.z.string().trim().max(1000).optional(),
});
