import crypto from "crypto";
import { prisma } from "../prisma";
import { AppError } from "../middleware/error.middleware";
import { ENV } from "../config/env";
import { sendEmailSafely } from "../utils/email";

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const HOURLY_CODE_LIMIT = 5;
const MAX_CODE_ATTEMPTS = 5;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function createError(
  message: string,
  statusCode: number,
  code?: string,
  retryAfterSeconds?: number,
): AppError & { retryAfterSeconds?: number } {
  const error: AppError & { retryAfterSeconds?: number } = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  error.retryAfterSeconds = retryAfterSeconds;
  return error;
}

function verificationSecret(): string {
  if (!ENV.EMAIL_CODE_SECRET) {
    throw createError(
      "Email verification is not configured.",
      503,
      "EMAIL_DELIVERY_UNAVAILABLE",
    );
  }
  return ENV.EMAIL_CODE_SECRET;
}

function genericCodeFailure(): AppError {
  return createError("Invalid or expired code", 400);
}

export class EmailVerificationService {
  static createCodeHash(code: string): string {
    return crypto
      .createHmac("sha256", verificationSecret())
      .update(code)
      .digest("hex");
  }

  private static async assertSendAllowed(userId: string): Promise<void> {
    const now = Date.now();
    const mostRecentCode = await prisma.emailVerificationCode.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });

    if (mostRecentCode) {
      const retryAfterSeconds = Math.ceil(
        (RESEND_COOLDOWN_MS - (now - mostRecentCode.createdAt.getTime())) / 1000,
      );
      if (retryAfterSeconds > 0) {
        throw createError(
          "Please wait before requesting a new code.",
          429,
          "RATE_LIMITED",
          retryAfterSeconds,
        );
      }
    }

    const hourAgo = new Date(now - 60 * 60 * 1000);
    const codesInLastHour = await prisma.emailVerificationCode.count({
      where: { userId, createdAt: { gte: hourAgo } },
    });

    if (codesInLastHour >= HOURLY_CODE_LIMIT) {
      const oldestRecentCode = await prisma.emailVerificationCode.findFirst({
        where: { userId, createdAt: { gte: hourAgo } },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      });
      const retryAfterSeconds = oldestRecentCode
        ? Math.max(
            1,
            Math.ceil(
              (oldestRecentCode.createdAt.getTime() +
                60 * 60 * 1000 -
                now) /
                1000,
            ),
          )
        : 3600;

      throw createError(
        "Too many verification codes requested. Please try again later.",
        429,
        "RATE_LIMITED",
        retryAfterSeconds,
      );
    }
  }

  private static async createAndSendCode(
    userId: string,
    email: string,
  ): Promise<void> {
    await this.assertSendAllowed(userId);

    const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
    const codeHash = this.createCodeHash(code);
    const expiresAt = new Date(Date.now() + CODE_TTL_MS);
    const text = [
      `Your Lostly verification code is ${code}`,
      "",
      "This code expires in 10 minutes.",
      "If you didn't request this, ignore this email.",
    ].join("\n");
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a;">
        <h2>Your Lostly verification code</h2>
        <p>Use this code to verify your email address:</p>
        <p style="display:inline-block;padding:14px 20px;background:#eef2ff;border:1px solid #c7d2fe;border-radius:12px;font-size:28px;letter-spacing:.4rem;font-weight:700;color:#312e81">${code}</p>
        <p>This code expires in 10 minutes.</p>
        <p>If you didn't request this, ignore this email.</p>
      </div>
    `;

    await sendEmailSafely({
      to: email,
      subject: "Your Lostly verification code",
      text,
      html,
    });

    await prisma.$transaction(async (tx) => {
      await tx.emailVerificationCode.updateMany({
        where: { userId, usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.emailVerificationCode.create({
        data: { userId, codeHash, expiresAt },
      });
    });
  }

  static async sendCodeForUser(userId: string, email: string): Promise<void> {
    const normalizedEmail = normalizeEmail(email);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, emailVerifiedAt: true },
    });

    if (!user || user.email !== normalizedEmail || user.emailVerifiedAt) {
      return;
    }

    await this.createAndSendCode(userId, normalizedEmail);
  }

  static async verifyAndMarkEmail(email: string, submittedCode: string) {
    const normalizedEmail = normalizeEmail(email);
    const now = new Date();
    const submittedHash = this.createCodeHash(submittedCode);

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { email: normalizedEmail },
        select: {
          id: true,
          name: true,
          email: true,
          profileImage: true,
          createdAt: true,
          emailVerifiedAt: true,
        },
      });

      if (!user || user.emailVerifiedAt) {
        return { failure: "invalid" as const };
      }

      const codeRecord = await tx.emailVerificationCode.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
      });

      if (
        !codeRecord ||
        codeRecord.usedAt ||
        codeRecord.expiresAt <= now
      ) {
        return { failure: "invalid" as const };
      }

      if (codeRecord.attempts >= MAX_CODE_ATTEMPTS) {
        return { failure: "attempts" as const };
      }

      const expectedHash = Buffer.from(codeRecord.codeHash, "hex");
      const actualHash = Buffer.from(submittedHash, "hex");
      const matches =
        expectedHash.length === actualHash.length &&
        crypto.timingSafeEqual(expectedHash, actualHash);

      if (!matches) {
        const attemptUpdate = await tx.emailVerificationCode.updateMany({
          where: {
            id: codeRecord.id,
            usedAt: null,
            attempts: codeRecord.attempts,
          },
          data: { attempts: { increment: 1 } },
        });

        if (attemptUpdate.count !== 1) {
          return { failure: "invalid" as const };
        }

        return {
          failure:
            codeRecord.attempts + 1 >= MAX_CODE_ATTEMPTS
              ? ("attempts" as const)
              : ("invalid" as const),
        };
      }

      const consumeResult = await tx.emailVerificationCode.updateMany({
        where: {
          id: codeRecord.id,
          usedAt: null,
          attempts: { lt: MAX_CODE_ATTEMPTS },
          expiresAt: { gt: now },
        },
        data: { usedAt: now },
      });

      if (consumeResult.count !== 1) {
        return { failure: "invalid" as const };
      }

      const verifiedUser = await tx.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: now },
        select: {
          id: true,
          name: true,
          email: true,
          profileImage: true,
          createdAt: true,
        },
      });

      return { user: verifiedUser };
    });

    if ("failure" in result) {
      if (result.failure === "attempts") {
        throw createError(
          "Too many attempts. Please request a new code.",
          400,
          "TOO_MANY_ATTEMPTS",
        );
      }
      throw genericCodeFailure();
    }

    return result.user;
  }

  static async resendVerification(email: string): Promise<void> {
    const normalizedEmail = normalizeEmail(email);
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, email: true, emailVerifiedAt: true },
    });

    if (!user || user.emailVerifiedAt) {
      return;
    }

    await this.createAndSendCode(user.id, user.email);
  }
}
