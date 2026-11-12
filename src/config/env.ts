import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const requiredVariables = [
  "EMAIL_CODE_SECRET",
  "JWT_ACCESS_SECRET",
  "JWT_REFRESH_SECRET",
  "DATABASE_URL",
] as const;

const secretVariables = [
  "EMAIL_CODE_SECRET",
  "JWT_ACCESS_SECRET",
  "JWT_REFRESH_SECRET",
] as const;

export function validateEnvironment(env: NodeJS.ProcessEnv = process.env): void {
  for (const variable of requiredVariables) {
    if (!env[variable]?.trim()) {
      throw new Error(`${variable} is required`);
    }
  }

  const isProduction = env.NODE_ENV === "production";
  const invalidSecrets = secretVariables.filter((variable) => {
    const secret = env[variable]!.trim();
    return secret.length < 32 || /(replace_with|your_)/i.test(secret);
  });

  if (isProduction) {
    const errors = [...invalidSecrets];
    for (let index = 0; index < secretVariables.length; index += 1) {
      const variable = secretVariables[index];
      for (const otherVariable of secretVariables.slice(index + 1)) {
        if (env[variable] === env[otherVariable]) {
          errors.push(`${variable} and ${otherVariable}`);
        }
      }
    }

    if (errors.length > 0) {
      throw new Error(
        `Invalid production configuration for: ${errors.join(", ")}`,
      );
    }
    return;
  }

  for (const variable of invalidSecrets) {
    console.warn(
      `Warning: ${variable} is short or uses a placeholder; use a unique random secret of at least 32 characters.`,
    );
  }
}

export const ENV = {
  PORT: process.env.PORT || 5000,
  DATABASE_URL: process.env.DATABASE_URL || "",
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || "",
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || "",
  JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN || "15m",
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || "7d",
  FRONTEND_URL: process.env.FRONTEND_URL || "http://localhost:3000",
  EMAIL_CODE_SECRET: process.env.EMAIL_CODE_SECRET || "",
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME || "",
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY || "",
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET || "",
};
