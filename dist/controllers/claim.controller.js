"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClaimController = void 0;
const claim_service_1 = require("../services/claim.service");
class ClaimController {
    static async create(req, res, next) {
        try {
            const claim = await claim_service_1.ClaimService.createClaim(req.user.id, req.body);
            res.status(201).json({ success: true, data: claim });
        }
        catch (error) {
            next(error);
        }
    }
    static async list(req, res, next) {
        try {
            const { role, status, page } = req.query;
            const result = await claim_service_1.ClaimService.getClaims(req.user.id, {
                role,
                status,
                page,
            });
            res.json({ success: true, data: result });
        }
        catch (error) {
            next(error);
        }
    }
    static async getById(req, res, next) {
        try {
            const claim = await claim_service_1.ClaimService.getClaimById(req.params.id, req.user.id);
            res.json({ success: true, data: claim });
        }
        catch (error) {
            next(error);
        }
    }
    static async update(req, res, next) {
        try {
            const claim = await claim_service_1.ClaimService.handleClaimAction(req.params.id, req.user.id, req.body);
            res.json({ success: true, data: claim });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.ClaimController = ClaimController;
