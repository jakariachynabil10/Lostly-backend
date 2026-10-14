-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "VerificationReviewStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('MATCH_FOUND', 'CLAIM_RECEIVED', 'QUESTIONS_ADDED', 'ANSWERS_SUBMITTED', 'MORE_INFO_REQUESTED', 'CLAIM_APPROVED', 'CLAIM_REJECTED', 'CLAIM_CANCELLED', 'CLAIM_COMPLETED');

-- AlterEnum
ALTER TYPE "ReportStatus" ADD VALUE 'CLAIM_PENDING';

-- CreateTable
CREATE TABLE "Claim" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "claimantId" TEXT NOT NULL,
    "finderId" TEXT NOT NULL,
    "status" "ClaimStatus" NOT NULL DEFAULT 'PENDING',
    "reviewNotes" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Claim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationQuestion" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationAnswer" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "claimantId" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "reviewStatus" "VerificationReviewStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "link" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Claim_matchId_idx" ON "Claim"("matchId");

-- CreateIndex
CREATE INDEX "Claim_claimantId_idx" ON "Claim"("claimantId");

-- CreateIndex
CREATE INDEX "Claim_finderId_idx" ON "Claim"("finderId");

-- CreateIndex
CREATE INDEX "Claim_status_idx" ON "Claim"("status");

-- CreateIndex
CREATE INDEX "VerificationQuestion_claimId_idx" ON "VerificationQuestion"("claimId");

-- CreateIndex
CREATE INDEX "VerificationAnswer_questionId_idx" ON "VerificationAnswer"("questionId");

-- CreateIndex
CREATE INDEX "VerificationAnswer_claimantId_idx" ON "VerificationAnswer"("claimantId");

-- CreateIndex
CREATE INDEX "Notification_userId_read_idx" ON "Notification"("userId", "read");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_claimantId_fkey" FOREIGN KEY ("claimantId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_finderId_fkey" FOREIGN KEY ("finderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationQuestion" ADD CONSTRAINT "VerificationQuestion_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationAnswer" ADD CONSTRAINT "VerificationAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "VerificationQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationAnswer" ADD CONSTRAINT "VerificationAnswer_claimantId_fkey" FOREIGN KEY ("claimantId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Partial unique index: Only one active claim (PENDING or UNDER_REVIEW) per (match, claimant)
CREATE UNIQUE INDEX "unique_active_claim_per_match_claimant" ON "Claim"("matchId", "claimantId") WHERE "status" IN ('PENDING', 'UNDER_REVIEW');

