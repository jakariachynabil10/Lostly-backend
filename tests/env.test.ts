import { afterEach, describe, expect, it, vi } from "vitest";
import { validateEnvironment } from "../src/config/env";

const requiredVariables = [
  "EMAIL_CODE_SECRET",
  "JWT_ACCESS_SECRET",
  "JWT_REFRESH_SECRET",
  "DATABASE_URL",
] as const;

function validEnvironment(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    EMAIL_CODE_SECRET: "email-code-secret-with-more-than-32-characters",
    JWT_ACCESS_SECRET: "jwt-access-secret-with-more-than-32-characters",
    JWT_REFRESH_SECRET: "jwt-refresh-secret-with-more-than-32-characters",
    DATABASE_URL: "postgresql://localhost:5432/lostly_test",
  };
}

describe("validateEnvironment", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(requiredVariables)("requires %s when missing", (variable) => {
    const env = validEnvironment();
    delete env[variable];

    expect(() => validateEnvironment(env)).toThrow(`${variable} is required`);
  });

  it.each(requiredVariables)("requires %s when empty", (variable) => {
    const env = validEnvironment();
    env[variable] = "";

    expect(() => validateEnvironment(env)).toThrow(`${variable} is required`);
  });

  it("rejects short secrets in production", () => {
    const env = validEnvironment();
    env.NODE_ENV = "production";
    env.JWT_ACCESS_SECRET = "access-secret-value";

    expect(() => validateEnvironment(env)).toThrow("JWT_ACCESS_SECRET");
  });

  it("rejects duplicate secrets in production", () => {
    const env = validEnvironment();
    env.NODE_ENV = "production";
    env.JWT_REFRESH_SECRET = env.JWT_ACCESS_SECRET;

    expect(() => validateEnvironment(env)).toThrow(
      "JWT_ACCESS_SECRET and JWT_REFRESH_SECRET",
    );
  });

  it.each(["replace_with", "your_"])(
    "rejects the %s placeholder in production",
    (placeholder) => {
      const env = validEnvironment();
      env.NODE_ENV = "production";
      env.EMAIL_CODE_SECRET = `${placeholder}${"x".repeat(32)}`;

      expect(() => validateEnvironment(env)).toThrow("EMAIL_CODE_SECRET");
    },
  );

  it("warns but allows short and placeholder secrets in development", () => {
    const env = validEnvironment();
    env.NODE_ENV = "development";
    env.JWT_ACCESS_SECRET = "access-secret-value";
    env.EMAIL_CODE_SECRET = `your_${"x".repeat(32)}`;
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(() => validateEnvironment(env)).not.toThrow();
    expect(warning).toHaveBeenCalledTimes(2);
    expect(warning.mock.calls.flat().join(" ")).not.toContain(
      env.JWT_ACCESS_SECRET,
    );
    expect(warning.mock.calls.flat().join(" ")).not.toContain(
      env.EMAIL_CODE_SECRET,
    );
  });
});
