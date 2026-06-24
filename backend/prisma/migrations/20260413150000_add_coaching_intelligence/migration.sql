-- AlterTable: Add coachingInsights to Analysis
ALTER TABLE "Analysis" ADD COLUMN "coachingInsights" JSONB;

-- AlterTable: Add topPerformer fields to Company
ALTER TABLE "Company" ADD COLUMN "topPerformerPlaybook" JSONB;
ALTER TABLE "Company" ADD COLUMN "topPerformerUpdatedAt" TIMESTAMP(3);
