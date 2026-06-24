-- Add saleClosedAt column to track actual sale close date from AmoCRM (closed_at)
-- Used for correct monthly/voronka/manager sales filtering instead of createdAt (sync time)
ALTER TABLE "AudioFile" ADD COLUMN IF NOT EXISTS "saleClosedAt" TIMESTAMP(6);
CREATE INDEX IF NOT EXISTS "AudioFile_saleClosedAt_idx" ON "AudioFile"("saleClosedAt");

-- AmoCRM lead.responsible_user_id (canonical sale owner) - prevents double-counting
-- when same lead has multiple audio files from different managers
ALTER TABLE "AudioFile" ADD COLUMN IF NOT EXISTS "saleResponsibleManagerId" TEXT;
CREATE INDEX IF NOT EXISTS "AudioFile_saleResponsibleManagerId_idx" ON "AudioFile"("saleResponsibleManagerId");

-- AmoCRM custom field ID for payment date (used as saleClosedAt source)
-- E.g. VisionSchool uses field "Дата платежа" id=1630853
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "salePaymentFieldId" INTEGER;
