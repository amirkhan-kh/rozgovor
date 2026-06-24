-- Sud Agent — admin/ROP qo'lda bekor qilish bayrog'i
ALTER TABLE "Analysis" ADD COLUMN "judgeOverridden" BOOLEAN NOT NULL DEFAULT false;
