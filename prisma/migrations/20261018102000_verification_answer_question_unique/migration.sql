-- Create unique index to guarantee a verification question can be answered once.
CREATE UNIQUE INDEX "VerificationAnswer_questionId_key" ON "VerificationAnswer" ("questionId");