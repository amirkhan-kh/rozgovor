-- Wave 3: Lesson batch pipeline — Yandex deferred STT + Gemini Flash batch
-- PHASE 1: upload → ffmpeg → Yandex S3 → submit deferred STT → opId saqlanadi
-- PHASE 2 (cron har 30 min): opId poll → transcription yozish → Gemini Flash batch
-- Status "processing" bo'lib turadi, transcription null/not null sub-state belgilaydi.

ALTER TABLE "Lesson"
  ADD COLUMN "sttOperationId" TEXT,
  ADD COLUMN "sttAudioKey"    TEXT;
