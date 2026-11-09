import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    refreshToken: { create: vi.fn() },
  },
  verification: {
    sendCodeForUser: vi.fn(),
    verifyAndMarkEmail: vi.fn(),
    resendVerification: vi.fn(),
  },
  hashPassword: vi.fn(),
  comparePassword: vi.fn(),
  signAccessToken: vi.fn(),
  signRefreshToken: vi.fn(),
  verifyRefreshToken: vi.fn(),
}));

vi.mock("../src/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("../src/services/email-verification.service", () => ({
  EmailVerificationService: mocks.verification,
}));
vi.mock("../src/utils/password", () => ({
  hashPassword: mocks.hashPassword,
  comparePassword: mocks.comparePassword,
}));
vi.mock("../src/utils/jwt", () => ({
  signAccessToken: mocks.signAccessToken,
  signRefreshToken: mocks.signRefreshToken,
  verifyRefreshToken: mocks.verifyRefreshToken,
}));

import { AuthService } from "../src/services/auth.service";

const user = {
  id: "user-1",
  name: "Test User",
  email: "test@example.com",
  password: "hashed-password",
  profileImage: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  emailVerifiedAt: null as Date | null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.hashPassword.mockResolvedValue("hashed-password");
  mocks.comparePassword.mockResolvedValue(true);
  mocks.signAccessToken.mockReturnValue("access-token");
  mocks.signRefreshToken.mockReturnValue("refresh-token");
  mocks.prisma.refreshToken.create.mockResolvedValue({ id: "refresh-1" });
  mocks.prisma.user.create.mockResolvedValue(user);
  mocks.prisma.user.update.mockResolvedValue(user);
  mocks.prisma.user.delete.mockResolvedValue(user);
  mocks.verification.sendCodeForUser.mockResolvedValue(undefined);
  mocks.verification.verifyAndMarkEmail.mockResolvedValue({
    ...user,
    emailVerifiedAt: new Date(),
  });
  mocks.verification.resendVerification.mockResolvedValue(undefined);
});

describe("AuthService email verification", () => {
  it("registers without issuing tokens and sends a verification code", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(null);

    const result = await AuthService.register({
      name: "Test User",
      email: " TEST@example.com ",
      password: "password123",
    });

    expect(result).toEqual({
      email: "test@example.com",
      requiresVerification: true,
    });
    expect(mocks.prisma.refreshToken.create).not.toHaveBeenCalled();
    expect(mocks.verification.sendCodeForUser).toHaveBeenCalled();
  });

  it("blocks unverified login without issuing tokens", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(user);

    await expect(
      AuthService.login({ email: user.email, password: "password123" }),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: "EMAIL_NOT_VERIFIED",
    });
    expect(mocks.verification.sendCodeForUser).toHaveBeenCalledWith(
      user.id,
      user.email,
    );
    expect(mocks.prisma.refreshToken.create).not.toHaveBeenCalled();
  });

  it("issues login tokens for migrated verified users", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      ...user,
      emailVerifiedAt: new Date(),
    });

    const result = await AuthService.login({
      email: user.email,
      password: "password123",
    });

    expect(result).toMatchObject({
      user: { id: user.id, email: user.email },
      accessToken: "access-token",
      refreshToken: "refresh-token",
    });
    expect(mocks.prisma.refreshToken.create).toHaveBeenCalled();
  });

  it("issues tokens after successful email verification", async () => {
    const result = await AuthService.verifyEmail({
      email: user.email,
      code: "123456",
    });

    expect(mocks.verification.verifyAndMarkEmail).toHaveBeenCalledWith(
      user.email,
      "123456",
    );
    expect(result).toMatchObject({
      user: { id: user.id, email: user.email },
      accessToken: "access-token",
      refreshToken: "refresh-token",
    });
  });

  it("returns the same generic resend response regardless of account existence", async () => {
    const existing = await AuthService.resendVerification(user.email);
    const unknown = await AuthService.resendVerification("missing@example.com");

    expect(existing).toEqual(unknown);
    expect(existing).toEqual({
      success: true,
      message: "If an account exists, a verification code has been sent.",
    });
  });
});
