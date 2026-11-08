"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authMiddleware = authMiddleware;
exports.optionalAuthMiddleware = optionalAuthMiddleware;
const jwt_1 = require("../utils/jwt");
const prisma_1 = require("../prisma");
async function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        res.status(401).json({
            success: false,
            message: "Authorization token missing or invalid format",
            errors: [],
        });
        return;
    }
    const token = authHeader.split(" ")[1];
    try {
        const payload = (0, jwt_1.verifyAccessToken)(token);
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: payload.userId },
            select: {
                id: true,
                email: true,
                name: true,
                profileImage: true,
            },
        });
        if (!user) {
            res.status(401).json({
                success: false,
                message: "User associated with this token no longer exists",
                errors: [],
            });
            return;
        }
        req.user = user;
        next();
    }
    catch (error) {
        if (error.name === "TokenExpiredError") {
            res.status(401).json({
                success: false,
                message: "Session token has expired. Please refresh token.",
                errors: [],
            });
            return;
        }
        res.status(401).json({
            success: false,
            message: "Invalid authentication token",
            errors: [],
        });
    }
}
async function optionalAuthMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return next();
    }
    const token = authHeader.split(" ")[1];
    try {
        const payload = (0, jwt_1.verifyAccessToken)(token);
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: payload.userId },
            select: {
                id: true,
                email: true,
                name: true,
                profileImage: true,
            },
        });
        if (user) {
            req.user = user;
        }
    }
    catch {
        // Silently continue for optional auth
    }
    next();
}
