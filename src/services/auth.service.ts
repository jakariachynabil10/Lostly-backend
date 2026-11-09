import { prisma } from "../prisma";
import { hashPassword, comparePassword } from "../utils/password";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../utils/jwt";
import { AppError } from "../middleware/error.middleware";
import { EmailVerificationService } from "./email-verification.service";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export class AuthService {
  static async issueTokenSet(user: { id: string; email: string; name: string; profileImage?: string | null; createdAt: Date }) {
    const accessToken = signAccessToken({ userId: user.id, email: user.email });
    const refreshToken = signRefreshToken({ userId: user.id, email: user.email });

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

  static async register(data: { name: string; email: string; password: string }) {
    const normalizedEmail = normalizeEmail(data.email);
    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existing) {
      if (existing.emailVerifiedAt === null) {
        const hashedPassword = await hashPassword(data.password);
        const updated = await prisma.user.update({
          where: { id: existing.id },
          data: {
            name: data.name.trim(),
            password: hashedPassword,
          },
          select: {
            id: true,
            email: true,
            emailVerifiedAt: true,
          },
        });

        await EmailVerificationService.sendCodeForUser(updated.id, updated.email);
        return { email: updated.email, requiresVerification: true };
      }

      const error: AppError = new Error("An account with this email already exists");
      error.statusCode = 400;
      throw error;
    }

    const hashedPassword = await hashPassword(data.password);

    const createdUser = await prisma.user.create({
      data: {
        name: data.name.trim(),
        email: normalizedEmail,
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

    try {
      await EmailVerificationService.sendCodeForUser(createdUser.id, createdUser.email);
    } catch (error: any) {
      await prisma.user.delete({ where: { id: createdUser.id } });
      if (error?.statusCode === 503) {
        const deliveryError: AppError = new Error(
          "Email delivery is unavailable. Please try again later.",
        );
        deliveryError.statusCode = 503;
        deliveryError.code = "EMAIL_DELIVERY_UNAVAILABLE";
        throw deliveryError;
      }
      throw error;
    }

    return { email: createdUser.email, requiresVerification: true };
  }

  static async verifyEmail(data: { email: string; code: string }) {
    const normalizedEmail = normalizeEmail(data.email);
    const user = await EmailVerificationService.verifyAndMarkEmail(
      normalizedEmail,
      data.code,
    );
    return this.issueTokenSet(user);
  }

  static async resendVerification(email: string) {
    await EmailVerificationService.resendVerification(email);
    return {
      success: true,
      message: "If an account exists, a verification code has been sent.",
    };
  }

  static async login(data: { email: string; password: string }) {
    const user = await prisma.user.findUnique({
      where: { email: normalizeEmail(data.email) },
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

    if (user.emailVerifiedAt === null) {
      try {
        await EmailVerificationService.sendCodeForUser(user.id, user.email);
      } catch (error) {
        if ((error as AppError).statusCode !== 429) {
          throw error;
        }
      }

      const error: AppError = new Error("Email not verified");
      error.statusCode = 403;
      error.code = "EMAIL_NOT_VERIFIED";
      throw error;
    }

    return this.issueTokenSet(user);
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

    await prisma.refreshToken.delete({
      where: { id: storedToken.id },
    });

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, name: true, profileImage: true, createdAt: true },
    });

    if (!user) {
      const error: AppError = new Error("User no longer exists");
      error.statusCode = 401;
      throw error;
    }

    return this.issueTokenSet(user);
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
