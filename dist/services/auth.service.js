"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const prisma_1 = require("../prisma");
const password_1 = require("../utils/password");
const jwt_1 = require("../utils/jwt");
class AuthService {
    static async register(data) {
        const existing = await prisma_1.prisma.user.findUnique({
            where: { email: data.email.toLowerCase().trim() },
        });
        if (existing) {
            const error = new Error("An account with this email already exists");
            error.statusCode = 400;
            throw error;
        }
        const hashedPassword = await (0, password_1.hashPassword)(data.password);
        const user = await prisma_1.prisma.user.create({
            data: {
                name: data.name.trim(),
                email: data.email.toLowerCase().trim(),
                password: hashedPassword,
            },
            select: {
                id: true,
                name: true,
                email: true,
                profileImage: true,
                createdAt: true,
            },
        });
        const accessToken = (0, jwt_1.signAccessToken)({ userId: user.id, email: user.email });
        const refreshToken = (0, jwt_1.signRefreshToken)({ userId: user.id, email: user.email });
        // Store refresh token
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);
        await prisma_1.prisma.refreshToken.create({
            data: {
                token: refreshToken,
                userId: user.id,
                expiresAt,
            },
        });
        return { user, accessToken, refreshToken };
    }
    static async login(data) {
        const user = await prisma_1.prisma.user.findUnique({
            where: { email: data.email.toLowerCase().trim() },
        });
        if (!user) {
            const error = new Error("Invalid email or password");
            error.statusCode = 401;
            throw error;
        }
        const isMatch = await (0, password_1.comparePassword)(data.password, user.password);
        if (!isMatch) {
            const error = new Error("Invalid email or password");
            error.statusCode = 401;
            throw error;
        }
        const accessToken = (0, jwt_1.signAccessToken)({ userId: user.id, email: user.email });
        const refreshToken = (0, jwt_1.signRefreshToken)({ userId: user.id, email: user.email });
        // Store refresh token (valid for 7 days)
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);
        await prisma_1.prisma.refreshToken.create({
            data: {
                token: refreshToken,
                userId: user.id,
                expiresAt,
            },
        });
        return {
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                profileImage: user.profileImage,
                createdAt: user.createdAt,
            },
            accessToken,
            refreshToken,
        };
    }
    static async refreshToken(oldToken) {
        let payload;
        try {
            payload = (0, jwt_1.verifyRefreshToken)(oldToken);
        }
        catch {
            const error = new Error("Invalid or expired refresh token");
            error.statusCode = 401;
            throw error;
        }
        const storedToken = await prisma_1.prisma.refreshToken.findUnique({
            where: { token: oldToken },
        });
        if (!storedToken || storedToken.expiresAt < new Date()) {
            if (storedToken) {
                await prisma_1.prisma.refreshToken.delete({ where: { id: storedToken.id } });
            }
            const error = new Error("Refresh token expired or revoked");
            error.statusCode = 401;
            throw error;
        }
        // Delete old refresh token (token rotation)
        await prisma_1.prisma.refreshToken.delete({
            where: { id: storedToken.id },
        });
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: payload.userId },
            select: { id: true, email: true, name: true, profileImage: true },
        });
        if (!user) {
            const error = new Error("User no longer exists");
            error.statusCode = 401;
            throw error;
        }
        const newAccessToken = (0, jwt_1.signAccessToken)({ userId: user.id, email: user.email });
        const newRefreshToken = (0, jwt_1.signRefreshToken)({ userId: user.id, email: user.email });
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);
        await prisma_1.prisma.refreshToken.create({
            data: {
                token: newRefreshToken,
                userId: user.id,
                expiresAt,
            },
        });
        return {
            user,
            accessToken: newAccessToken,
            refreshToken: newRefreshToken,
        };
    }
    static async logout(token) {
        if (token) {
            await prisma_1.prisma.refreshToken.deleteMany({
                where: { token },
            });
        }
        return { success: true };
    }
    static async getProfile(userId) {
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                name: true,
                email: true,
                profileImage: true,
                createdAt: true,
                _count: {
                    select: {
                        reports: true,
                    },
                },
            },
        });
        if (!user) {
            const error = new Error("User not found");
            error.statusCode = 404;
            throw error;
        }
        return user;
    }
    static async updateProfile(userId, data) {
        const user = await prisma_1.prisma.user.update({
            where: { id: userId },
            data: {
                ...(data.name && { name: data.name.trim() }),
                ...(data.profileImage !== undefined && { profileImage: data.profileImage }),
            },
            select: {
                id: true,
                name: true,
                email: true,
                profileImage: true,
                createdAt: true,
            },
        });
        return user;
    }
}
exports.AuthService = AuthService;
