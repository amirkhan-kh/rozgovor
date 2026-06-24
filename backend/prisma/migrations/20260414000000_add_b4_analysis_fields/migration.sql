-- B4-1: Extended analysis fields (call structure, questions, close attempts, voice of customer, intent signals)
ALTER TABLE "Analysis" ADD COLUMN "callStructure" JSONB;
ALTER TABLE "Analysis" ADD COLUMN "questions" JSONB;
ALTER TABLE "Analysis" ADD COLUMN "closeAttempts" JSONB;
ALTER TABLE "Analysis" ADD COLUMN "voiceOfCustomer" JSONB;
ALTER TABLE "Analysis" ADD COLUMN "intentSignals" JSONB;
