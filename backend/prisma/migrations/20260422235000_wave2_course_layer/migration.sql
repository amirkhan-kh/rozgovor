-- Wave 2: 3-qatlamli dars hierarchy — Course → LessonModule → Lesson
-- courseId LessonModule ga qo'shiladi (nullable — eski modullar orphan qoladi).

-- CreateTable: Course (kurs — modullarning yuqori qatlami)
CREATE TABLE "Course" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Course_companyId_idx" ON "Course"("companyId");

ALTER TABLE "Course" ADD CONSTRAINT "Course_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: LessonModule.courseId (modul qaysi kursga tegishli — nullable)
ALTER TABLE "LessonModule" ADD COLUMN "courseId" TEXT;

CREATE INDEX "LessonModule_courseId_sortOrder_idx" ON "LessonModule"("courseId", "sortOrder");

ALTER TABLE "LessonModule" ADD CONSTRAINT "LessonModule_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;
