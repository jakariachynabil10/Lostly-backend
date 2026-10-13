import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../types";
import { verifyAccessToken } from "../utils/jwt";
import { prisma } from "../prisma";

export async function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
      success: false,
      message: "Authorization token missing or invalid format",
    });
    return;
  }

  const token = authHeader.split(" ")[1];

  try {
    const payload = verifyAccessToken(token);

    const user = await prisma.user.findUnique({
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
      });
      return;
    }

    req.user = user;
    next();
  } catch (error: any) {
    if (error.name === "TokenExpiredError") {
      res.status(401).json({
        success: false,
        code: "TOKEN_EXPIRED",
        message: "Session token has expired. Please refresh token.",
      });
      return;
    }
    res.status(401).json({
      success: false,
      message: "Invalid authentication token",
    });
  }
}

export async function optionalAuthMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next();
  }

  const token = authHeader.split(" ")[1];

  try {
    const payload = verifyAccessToken(token);
    const user = await prisma.user.findUnique({
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
  } catch {
    // Silently continue for optional auth
  }

  next();
}
