-- Customer Development (Custdev) — MVP Group D (task 3)
-- Company create Custdev projects, define questions, upload customer
-- interview audios, AI transcribes + extracts per-question answers +
-- produces per-interview and cross-interview summaries.

-- CreateTable
CREATE TABLE "Custdev" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "aiSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Custdev_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustdevQuestion" (
    "id" TEXT NOT NULL,
    "custdevId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CustdevQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustdevInterview" (
    "id" TEXT NOT NULL,
    "custdevId" TEXT NOT NULL,
    "audioUrl" TEXT NOT NULL,
    "audioKey" TEXT,
    "transcription" TEXT,
    "durationSec" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "aiSummary" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustdevInterview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustdevAnswer" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "timestamp" INTEGER,

    CONSTRAINT "CustdevAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Custdev_companyId_idx" ON "Custdev"("companyId");

-- CreateIndex
CREATE INDEX "CustdevQuestion_custdevId_idx" ON "CustdevQuestion"("custdevId");

-- CreateIndex
CREATE INDEX "CustdevInterview_custdevId_idx" ON "CustdevInterview"("custdevId");

-- CreateIndex
CREATE INDEX "CustdevAnswer_interviewId_idx" ON "CustdevAnswer"("interviewId");

-- CreateIndex
CREATE UNIQUE INDEX "CustdevAnswer_questionId_interviewId_key" ON "CustdevAnswer"("questionId", "interviewId");

-- AddForeignKey
ALTER TABLE "Custdev" ADD CONSTRAINT "Custdev_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustdevQuestion" ADD CONSTRAINT "CustdevQuestion_custdevId_fkey" FOREIGN KEY ("custdevId") REFERENCES "Custdev"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustdevInterview" ADD CONSTRAINT "CustdevInterview_custdevId_fkey" FOREIGN KEY ("custdevId") REFERENCES "Custdev"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustdevAnswer" ADD CONSTRAINT "CustdevAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "CustdevQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustdevAnswer" ADD CONSTRAINT "CustdevAnswer_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "CustdevInterview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
