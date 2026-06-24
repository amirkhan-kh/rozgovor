-- B2-2 Follow-up Signal
ALTER TABLE "Analysis" ADD COLUMN "requiresFollowup" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Analysis" ADD COLUMN "followupReason" TEXT;
ALTER TABLE "Analysis" ADD COLUMN "followupPhrase" TEXT;
ALTER TABLE "Analysis" ADD COLUMN "followupDeadline" TIMESTAMP(3);
ALTER TABLE "Analysis" ADD COLUMN "followupCompleted" BOOLEAN NOT NULL DEFAULT false;

-- B2-9 Promise Tracking
ALTER TABLE "Analysis" ADD COLUMN "promises" JSONB;

-- B3-4 MEDDIC/BANT Qualification
ALTER TABLE "Analysis" ADD COLUMN "qualification" JSONB;

-- B3-10 Respect indicators
ALTER TABLE "Analysis" ADD COLUMN "respect" JSONB;

-- B2-5 Lead Heat Score
ALTER TABLE "Analysis" ADD COLUMN "leadHeatScore" INTEGER;

-- Indexes
CREATE INDEX "Analysis_requiresFollowup_followupCompleted_idx" ON "Analysis"("requiresFollowup", "followupCompleted");
CREATE INDEX "Analysis_leadHeatScore_idx" ON "Analysis"("leadHeatScore");
