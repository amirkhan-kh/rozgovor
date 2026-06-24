-- AlterTable
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "excludedPipelines" text[] DEFAULT ARRAY[]::text[];

-- AlterTable (AudioFile.leadTags)
ALTER TABLE "AudioFile" ADD COLUMN IF NOT EXISTS "leadTags" text;
