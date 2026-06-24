-- CreateTable: LessonModule (modullar — darslarning yuqori qatlami)
CREATE TABLE "LessonModule" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LessonModule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LessonModule_companyId_sortOrder_idx" ON "LessonModule"("companyId", "sortOrder");

ALTER TABLE "LessonModule" ADD CONSTRAINT "LessonModule_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: ModuleAssignment (manager'ga butun modul biriktirish)
CREATE TABLE "ModuleAssignment" (
  "id" TEXT NOT NULL,
  "moduleId" TEXT NOT NULL,
  "managerId" TEXT NOT NULL,
  "assignedById" TEXT NOT NULL,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dueDate" TIMESTAMP(3),
  CONSTRAINT "ModuleAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ModuleAssignment_moduleId_managerId_key"
  ON "ModuleAssignment"("moduleId", "managerId");
CREATE INDEX "ModuleAssignment_managerId_idx" ON "ModuleAssignment"("managerId");
CREATE INDEX "ModuleAssignment_moduleId_idx" ON "ModuleAssignment"("moduleId");

ALTER TABLE "ModuleAssignment" ADD CONSTRAINT "ModuleAssignment_moduleId_fkey"
  FOREIGN KEY ("moduleId") REFERENCES "LessonModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModuleAssignment" ADD CONSTRAINT "ModuleAssignment_managerId_fkey"
  FOREIGN KEY ("managerId") REFERENCES "Manager"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: Lesson.moduleId (dars qaysi modulga tegishli)
ALTER TABLE "Lesson" ADD COLUMN "moduleId" TEXT;

CREATE INDEX "Lesson_moduleId_sortOrder_idx" ON "Lesson"("moduleId", "sortOrder");

ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_moduleId_fkey"
  FOREIGN KEY ("moduleId") REFERENCES "LessonModule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
