-- Sud Agent (B5-1) — qisqa qo'ng'iroqlarni reytingdan chiqarish
ALTER TABLE "Analysis" ADD COLUMN "judgeSkipped" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Analysis" ADD COLUMN "judgeReason" TEXT;

-- Index — manager avg score computation uchun
CREATE INDEX "Analysis_judgeSkipped_idx" ON "Analysis"("judgeSkipped");
