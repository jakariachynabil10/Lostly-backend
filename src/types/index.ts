import { Request } from "express";
import { ReportType, ReportStatus } from "@prisma/client";

export interface TokenPayload {
  userId: string;
  email: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  profileImage?: string | null;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

export interface MatchFactor {
  factor: string;
  weight: number;
  score: number;
  earned: number;
  matched: boolean;
  details: string;
}

export interface MatchResult {
  similarityScore: number;
  matchingFactors: MatchFactor[];
  tier: "VERY_STRONG" | "STRONG_POSSIBLE" | "POSSIBLE" | "LOW_MATCH";
}

export interface ReportFilterOptions {
  type?: ReportType;
  categoryId?: string;
  status?: ReportStatus;
  search?: string;
  location?: string;
  color?: string;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
  sortBy?: "createdAt" | "date" | "itemName";
  sortOrder?: "asc" | "desc";
}
