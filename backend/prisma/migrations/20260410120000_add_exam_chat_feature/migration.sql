-- CreateTable
CREATE TABLE "ExamScenario" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "systemPrompt" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL DEFAULT 'medium',
    "icon" TEXT NOT NULL DEFAULT '👤',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExamScenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamSession" (
    "id" TEXT NOT NULL,
    "salespersonId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "messages" JSONB NOT NULL DEFAULT '[]',
    "audioUrl" TEXT,
    "duration" INTEGER NOT NULL DEFAULT 0,
    "overallScore" INTEGER,
    "criteria" JSONB,
    "errors" JSONB,
    "winPoints" JSONB,
    "coaching" JSONB,
    "summary" TEXT,
    "ttsCacheHits" INTEGER NOT NULL DEFAULT 0,
    "geminiCacheId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ExamSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TtsCache" (
    "id" TEXT NOT NULL,
    "textHash" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "voice" TEXT NOT NULL DEFAULT 'alena',
    "gcsPath" TEXT NOT NULL,
    "hitCount" INTEGER NOT NULL DEFAULT 0,
    "bytes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TtsCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeaturePermission" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeaturePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalespersonStats" (
    "id" TEXT NOT NULL,
    "salespersonId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "totalExams" INTEGER NOT NULL DEFAULT 0,
    "completedExams" INTEGER NOT NULL DEFAULT 0,
    "averageScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bestScore" INTEGER NOT NULL DEFAULT 0,
    "streak" INTEGER NOT NULL DEFAULT 0,
    "lastExamAt" TIMESTAMP(3),
    "weakCriteria" JSONB,
    "strongCriteria" JSONB,
    "weeklyScores" JSONB,
    "scenarioStats" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalespersonStats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExamScenario_companyId_isActive_idx" ON "ExamScenario"("companyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ExamScenario_companyId_code_key" ON "ExamScenario"("companyId", "code");

-- CreateIndex
CREATE INDEX "ExamSession_salespersonId_completedAt_idx" ON "ExamSession"("salespersonId", "completedAt");

-- CreateIndex
CREATE INDEX "ExamSession_companyId_status_idx" ON "ExamSession"("companyId", "status");

-- CreateIndex
CREATE INDEX "ExamSession_companyId_scenarioId_idx" ON "ExamSession"("companyId", "scenarioId");

-- CreateIndex
CREATE UNIQUE INDEX "TtsCache_textHash_key" ON "TtsCache"("textHash");

-- CreateIndex
CREATE INDEX "TtsCache_textHash_idx" ON "TtsCache"("textHash");

-- CreateIndex
CREATE INDEX "FeaturePermission_companyId_feature_idx" ON "FeaturePermission"("companyId", "feature");

-- CreateIndex
CREATE UNIQUE INDEX "FeaturePermission_companyId_feature_role_key" ON "FeaturePermission"("companyId", "feature", "role");

-- CreateIndex
CREATE UNIQUE INDEX "SalespersonStats_salespersonId_key" ON "SalespersonStats"("salespersonId");

-- CreateIndex
CREATE INDEX "SalespersonStats_companyId_averageScore_idx" ON "SalespersonStats"("companyId", "averageScore");

-- AddForeignKey
ALTER TABLE "ExamScenario" ADD CONSTRAINT "ExamScenario_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamSession" ADD CONSTRAINT "ExamSession_salespersonId_fkey" FOREIGN KEY ("salespersonId") REFERENCES "Manager"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamSession" ADD CONSTRAINT "ExamSession_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamSession" ADD CONSTRAINT "ExamSession_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "ExamScenario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeaturePermission" ADD CONSTRAINT "FeaturePermission_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalespersonStats" ADD CONSTRAINT "SalespersonStats_salespersonId_fkey" FOREIGN KEY ("salespersonId") REFERENCES "Manager"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalespersonStats" ADD CONSTRAINT "SalespersonStats_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

