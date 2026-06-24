-- Wave 3: Manager biriktirish Course darajasiga ko'chiriladi.
-- Kurs biriktirilgan manager shu kurs ichidagi BARCHA modul va darslarga kirish oladi.
-- ModuleAssignment jadvali saqlanadi (back-compat) — eski ma'lumot yo'qolmasin.

CREATE TABLE "CourseAssignment" (
  "id"           TEXT NOT NULL,
  "courseId"     TEXT NOT NULL,
  "managerId"    TEXT NOT NULL,
  "assignedById" TEXT,
  "assignedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dueDate"      TIMESTAMP(3),
  CONSTRAINT "CourseAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CourseAssignment_courseId_managerId_key"
  ON "CourseAssignment"("courseId", "managerId");
CREATE INDEX "CourseAssignment_managerId_idx" ON "CourseAssignment"("managerId");

ALTER TABLE "CourseAssignment" ADD CONSTRAINT "CourseAssignment_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseAssignment" ADD CONSTRAINT "CourseAssignment_managerId_fkey"
  FOREIGN KEY ("managerId") REFERENCES "Manager"("id") ON DELETE CASCADE ON UPDATE CASCADE;
