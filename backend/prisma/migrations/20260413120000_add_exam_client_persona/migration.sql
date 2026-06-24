-- Add client persona fields (age, gender, name) to ExamSession
ALTER TABLE "ExamSession" ADD COLUMN "clientAge" INTEGER;
ALTER TABLE "ExamSession" ADD COLUMN "clientGender" TEXT;
ALTER TABLE "ExamSession" ADD COLUMN "clientName" TEXT;
