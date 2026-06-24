-- MVP Bitrix extension — B1: Partial payment, B2: Kelishilgan to'lov,
-- B3: Activity sync + WebSocket, B4: Department structure.

-- SalesLead — yangi maydonlar
ALTER TABLE "SalesLead" ADD COLUMN IF NOT EXISTS "isPartialPayment" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SalesLead" ADD COLUMN IF NOT EXISTS "agreedPaymentDate" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "SalesLead_companyId_isPartialPayment_idx" ON "SalesLead"("companyId", "isPartialPayment");
CREATE INDEX IF NOT EXISTS "SalesLead_companyId_agreedPaymentDate_idx" ON "SalesLead"("companyId", "agreedPaymentDate");

-- Manager — departmentId
ALTER TABLE "Manager" ADD COLUMN IF NOT EXISTS "departmentId" TEXT;

-- Department jadvali
CREATE TABLE IF NOT EXISTS "Department" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "parentId" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Department_companyId_idx" ON "Department"("companyId");
CREATE INDEX IF NOT EXISTS "Department_parentId_idx" ON "Department"("parentId");

-- FK'lar
DO $$ BEGIN
  ALTER TABLE "Department" ADD CONSTRAINT "Department_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Manager" ADD CONSTRAINT "Manager_departmentId_fkey"
    FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Activity jadvali
CREATE TABLE IF NOT EXISTS "Activity" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "bitrixId" TEXT NOT NULL,
  "ownerType" INTEGER,
  "ownerId" TEXT,
  "leadId" INTEGER,
  "dealId" INTEGER,
  "typeId" INTEGER,
  "subject" TEXT,
  "direction" INTEGER,
  "priority" INTEGER,
  "responsibleId" TEXT,
  "managerId" TEXT,
  "deadline" TIMESTAMP(3),
  "startTime" TIMESTAMP(3),
  "endTime" TIMESTAMP(3),
  "completed" BOOLEAN NOT NULL DEFAULT false,
  "status" INTEGER,
  "createdBitrix" TIMESTAMP(3),
  "updatedBitrix" TIMESTAMP(3),
  "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Activity_bitrixId_key" ON "Activity"("bitrixId");
CREATE INDEX IF NOT EXISTS "Activity_companyId_completed_idx" ON "Activity"("companyId", "completed");
CREATE INDEX IF NOT EXISTS "Activity_companyId_deadline_idx" ON "Activity"("companyId", "deadline");
CREATE INDEX IF NOT EXISTS "Activity_companyId_managerId_idx" ON "Activity"("companyId", "managerId");
CREATE INDEX IF NOT EXISTS "Activity_companyId_dealId_idx" ON "Activity"("companyId", "dealId");
CREATE INDEX IF NOT EXISTS "Activity_companyId_leadId_idx" ON "Activity"("companyId", "leadId");

DO $$ BEGIN
  ALTER TABLE "Activity" ADD CONSTRAINT "Activity_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Activity" ADD CONSTRAINT "Activity_managerId_fkey"
    FOREIGN KEY ("managerId") REFERENCES "Manager"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
