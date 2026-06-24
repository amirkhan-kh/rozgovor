-- Company course/product knowledge base (Markdown text)
-- Used to inject into Gemini Pro analysis prompt so it can verify
-- if manager is telling the correct course info (price, modules, bonuses) to client
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "courseInfo" TEXT;
