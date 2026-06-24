-- AlterTable: Combine audioLimit, analysisLimit, dailyLimit into totalLimitHours
ALTER TABLE "Company" ADD COLUMN "totalLimitHours" INTEGER NOT NULL DEFAULT 500;
ALTER TABLE "Company" DROP COLUMN "dailyLimit";
ALTER TABLE "Company" DROP COLUMN "analysisLimit";
ALTER TABLE "Company" DROP COLUMN "audioLimit";

-- AlterTable: Add clientId, clientSecret, redirectUri to AmoCredential and change token columns to TEXT
ALTER TABLE "AmoCredential" ADD COLUMN "clientId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "AmoCredential" ADD COLUMN "clientSecret" TEXT NOT NULL DEFAULT '';
ALTER TABLE "AmoCredential" ADD COLUMN "redirectUri" TEXT NOT NULL DEFAULT '';
ALTER TABLE "AmoCredential" ALTER COLUMN "accessToken" SET DATA TYPE TEXT;
ALTER TABLE "AmoCredential" ALTER COLUMN "refreshToken" SET DATA TYPE TEXT;
