-- MVP: Rollar va Ruhsatlar (super admin)
-- RoleDefault enum — Manager.role stringda saqlanadi, enum faqat kod-level konstanta sifatida
CREATE TYPE "RoleDefault" AS ENUM ('ROP', 'MANAGER', 'BOSS');

-- Har menejer uchun alohida ruxsatlar (override). pageKey + actionKey bo'yicha unikal.
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,
    "pageKey" TEXT NOT NULL,
    "actionKey" TEXT,
    "allowed" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Permission_managerId_pageKey_actionKey_key" ON "Permission"("managerId", "pageKey", "actionKey");
CREATE INDEX "Permission_managerId_idx" ON "Permission"("managerId");

ALTER TABLE "Permission" ADD CONSTRAINT "Permission_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Manager"("id") ON DELETE CASCADE ON UPDATE CASCADE;
