-- Wave 4: Manager Celebration Videos (VEO 3)
-- Menejer o'z foto'sini yuklaydi → 5 ta VEO 3 ssenariy batch generatsiya qilinadi.
-- Har video uchun menejer musiqa biriktirishi va CapCut uslubida trim qilishi mumkin.
-- Videolar Yandex Object Storage'da hostlanadi (uzoq muddatli).

ALTER TABLE "Manager"
  ADD COLUMN "customPhotoUrl" TEXT;

CREATE TABLE "ManagerVideo" (
  "id"            TEXT        NOT NULL,
  "managerId"     TEXT        NOT NULL,
  "scenarioId"    INTEGER     NOT NULL,
  "scenarioName"  TEXT        NOT NULL,
  "operationId"   TEXT,
  "videoUrl"      TEXT,
  "thumbnailUrl"  TEXT,
  "status"        TEXT        NOT NULL DEFAULT 'pending',
  "errorMessage"  TEXT,
  "musicUrl"      TEXT,
  "musicStartSec" DOUBLE PRECISION,
  "musicEndSec"   DOUBLE PRECISION,
  "musicVolume"   DOUBLE PRECISION DEFAULT 1.0,
  "finalVideoUrl" TEXT,
  "finalMixedAt"  TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ManagerVideo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ManagerVideo_managerId_scenarioId_key"
  ON "ManagerVideo" ("managerId", "scenarioId");

CREATE INDEX "ManagerVideo_managerId_idx" ON "ManagerVideo" ("managerId");
CREATE INDEX "ManagerVideo_status_idx"    ON "ManagerVideo" ("status");

ALTER TABLE "ManagerVideo"
  ADD CONSTRAINT "ManagerVideo_managerId_fkey"
  FOREIGN KEY ("managerId") REFERENCES "Manager"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
