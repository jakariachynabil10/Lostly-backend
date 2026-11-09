import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    emailVerificationCode: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
  };

  return {
    tx,
    prisma: {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
      user: { findUnique: vi.fn() },
      emailVerificationCode: {
        findFirst: vi.fn(),
        count: vi.fn(),
      },
    },
    sendEmail: vi.fn(),
  };
});

vi.mock("../src/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("../src/config/env", () => ({
  ENV: { EMAIL_CODE_SECRET: "test-email-code-secret" },
}));
vi.mock("../src/utils/email", () => ({ sendEmailSafely: mocks.sendEmail }));

import { EmailVerificationService } from "../src/services/email-verification.service";

const user = {
  id: "user-1",
  name: "Test User",
  email: "test@example.com",
  profileImage: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  emailVerifiedAt: null,
};

function codeRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "code-1",
    userId: user.id,
    codeHash: EmailVerificationService.createCodeHash("123456"),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    attempts: 0,
    usedAt: null,
    createdAt: new Date(Date.now() - 61 * 1000),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.tx.user.findUnique.mockResolvedValue(user);
  mocks.tx.user.update.mockResolvedValue({
    id: user.id,
    name: user.name,
    email: user.email,
    profileImage: user.profileImage,
    createdAt: user.createdAt,
  });
  mocks.tx.emailVerificationCode.findFirst.mockResolvedValue(codeRecord());
  mocks.tx.emailVerificationCode.updateMany.mockResolvedValue({ count: 1 });
  mocks.tx.emailVerificationCode.create.mockResolvedValue({ id: "code-2" });
  mocks.prisma.user.findUnique.mockResolvedValue({
    email: user.email,
    emailVerifiedAt: null,
  });
  mocks.prisma.emailVerificationCode.findFirst.mockResolvedValue(null);
  mocks.prisma.emailVerificationCode.count.mockResolvedValue(0);
  mocks.sendEmail.mockResolvedValue(undefined);
});

describe("EmailVerificationService", () => {
  it("uses a keyed hash rather than storing the plain code", () => {
    const hash = EmailVerificationService.createCodeHash("123456");
    expect(hash).not.toBe("123456");
    expect(hash).toBe(EmailVerificationService.createCodeHash("123456"));
    expect(hash).not.toBe(EmailVerificationService.createCodeHash("654321"));
  });

  it("marks the user verified and consumes a correct code exactly once", async () => {
    const verifiedUser = await EmailVerificationService.verifyAndMarkEmail(
      user.email,
      "123456",
    );

    expect(verifiedUser).toMatchObject({ id: user.id, email: user.email });
    expect(mocks.tx.emailVerificationCode.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "code-1", usedAt: null }),
        data: expect.objectContaining({ usedAt: expect.any(Date) }),
      }),
    );
    expect(mocks.tx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: user.id },
        data: { emailVerifiedAt: expect.any(Date) },
      }),
    );
  });

  it("increments wrong-code attempts and kills the code on the fifth failure", async () => {
    mocks.tx.emailVerificationCode.findFirst.mockResolvedValue(
      codeRecord({ attempts: 4 }),
    );

    await expect(
      EmailVerificationService.verifyAndMarkEmail(user.email, "000000"),
    ).rejects.toMatchObject({
      message: "Too many attempts. Please request a new code.",
      code: "TOO_MANY_ATTEMPTS",
    });
    expect(mocks.tx.emailVerificationCode.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { attempts: { increment: 1 } },
      }),
    );
    expect(mocks.tx.user.update).not.toHaveBeenCalled();
  });

  it.each([
    ["expired", { expiresAt: new Date(Date.now() - 1000) }],
    ["used", { usedAt: new Date() }],
  ])("returns the generic failure for a %s code", async (_label, overrides) => {
    mocks.tx.emailVerificationCode.findFirst.mockResolvedValue(
      codeRecord(overrides),
    );

    await expect(
      EmailVerificationService.verifyAndMarkEmail(user.email, "123456"),
    ).rejects.toMatchObject({ message: "Invalid or expired code" });
  });

  it("invalidates old codes and stores only the new code hash", async () => {
    await expect(
      EmailVerificationService.sendCodeForUser(user.id, user.email),
    ).resolves.toBeUndefined();

    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "Your Lostly verification code",
        text: expect.stringMatching(/\b\d{6}\b/),
        html: expect.stringContaining("expires in 10 minutes"),
      }),
    );
    expect(mocks.tx.emailVerificationCode.updateMany).toHaveBeenCalledWith({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
    const createdCode = mocks.tx.emailVerificationCode.create.mock.calls[0][0];
    expect(createdCode.data.codeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(createdCode.data).not.toHaveProperty("code");
  });

  it("enforces the resend cooldown and hourly code limit", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: user.id,
      email: user.email,
      emailVerifiedAt: null,
    });
    mocks.prisma.emailVerificationCode.findFirst.mockResolvedValue({
      createdAt: new Date(Date.now() - 10_000),
    });

    await expect(
      EmailVerificationService.resendVerification(user.email),
    ).rejects.toMatchObject({ statusCode: 429, retryAfterSeconds: expect.any(Number) });

    mocks.prisma.emailVerificationCode.findFirst
      .mockResolvedValueOnce({ createdAt: new Date(Date.now() - 61_000) })
      .mockResolvedValueOnce({ createdAt: new Date(Date.now() - 30 * 60_000) });
    mocks.prisma.emailVerificationCode.count.mockResolvedValue(5);

    await expect(
      EmailVerificationService.resendVerification(user.email),
    ).rejects.toMatchObject({ statusCode: 429, retryAfterSeconds: expect.any(Number) });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("does not send a code for an unknown email", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      EmailVerificationService.resendVerification("missing@example.com"),
    ).resolves.toBeUndefined();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });
});
