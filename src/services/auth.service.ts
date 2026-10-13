import { prisma } from "../prisma";
import { hashPassword, comparePassword } from "../utils/password";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../utils/jwt";
import { AppError } from "../middleware/error.middleware";

export class AuthService {
  static async register(data: { name: string; email: string; password: string }) {
    const existing = await prisma.user.findUnique({
      where: { email: data.email.toLowerCase().trim() },
    });

    if (existing) {
      const error: AppError = new Error("An account with this email already exists");
      error.statusCode = 400;
      throw error;
    }

    const hashedPassword = await hashPassword(data.password);

    const user = await prisma.user.create({
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

    const accessToken = signAccessToken({ userId: user.id, email: user.email });
    const refreshToken = signRefreshToken({ userId: user.id, email: user.email });

    // Store refresh token
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt,
      },
    });

    return { user, accessToken, refreshToken };
  }

  static async login(data: { email: string; password: string }) {
    const user = await prisma.user.findUnique({
      where: { email: data.email.toLowerCase().trim() },
    });

    if (!user) {
      const error: AppError = new Error("Invalid email or password");
      error.statusCode = 401;
      throw error;
    }

    const isMatch = await comparePassword(data.password, user.password);
    if (!isMatch) {
      const error: AppError = new Error("Invalid email or password");
      error.statusCode = 401;
      throw error;
    }

    const accessToken = signAccessToken({ userId: user.id, email: user.email });
    const refreshToken = signRefreshToken({ userId: user.id, email: user.email });

    // Store refresh token (valid for 7 days)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await prisma.refreshToken.create({
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

  static async refreshToken(oldToken: string) {
    let payload;
    try {
      payload = verifyRefreshToken(oldToken);
    } catch {
      const error: AppError = new Error("Invalid or expired refresh token");
      error.statusCode = 401;
      throw error;
    }

    const storedToken = await prisma.refreshToken.findUnique({
      where: { token: oldToken },
    });

    if (!storedToken || storedToken.expiresAt < new Date()) {
      if (storedToken) {
        await prisma.refreshToken.delete({ where: { id: storedToken.id } });
      }
      const error: AppError = new Error("Refresh token expired or revoked");
      error.statusCode = 401;
      throw error;
    }

    // Delete old refresh token (token rotation)
    await prisma.refreshToken.delete({
      where: { id: storedToken.id },
    });

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, name: true, profileImage: true },
    });

    if (!user) {
      const error: AppError = new Error("User no longer exists");
      error.statusCode = 401;
      throw error;
    }

    const newAccessToken = signAccessToken({ userId: user.id, email: user.email });
    const newRefreshToken = signRefreshToken({ userId: user.id, email: user.email });

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await prisma.refreshToken.create({
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

  static async logout(token?: string) {
    if (token) {
      await prisma.refreshToken.deleteMany({
        where: { token },
      });
    }
    return { success: true };
  }

  static async getProfile(userId: string) {
    const user = await prisma.user.findUnique({
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
      const error: AppError = new Error("User not found");
      error.statusCode = 404;
      throw error;
    }

    return user;
  }

  static async updateProfile(userId: string, data: { name?: string; profileImage?: string | null }) {
    const user = await prisma.user.update({
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
