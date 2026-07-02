-- v3 — CRM yopish sababi bo'yicha LLM hukmi (COUPLED). Gemini transkript + CRM sababni o'qib to'ldiradi.
-- { status: "haq"|"noxaq"|"noaniq", reason: string }  — sabab yo'q bo'lsa null (→ heuristik fallback).
ALTER TABLE "Analysis" ADD COLUMN "closeReasonVerdict" JSONB;
