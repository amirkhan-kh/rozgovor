/**
 * Foydalanuvchi yopishtirgan erkin matndan keys metadata'ni ajratish.
 * Gemini 2.5 Flash + JSON response.
 */

import { GoogleGenAI } from "@google/genai";

const FLASH_MODEL = "gemini-2.5-flash";

export interface ParsedClientInfo {
  title: string;
  clientName?: string;
  clientPhone?: string;
  authority?: string;
}

const PROMPT = `
Quyidagi erkin matndan keys metadata'ni ajratib JSON qaytar.
Maydonlar:
  - title (majburiy): qisqa sarlavha. Mijoz ismi + asosiy holat (mas: "Turdiyeva Mo'mina — refund da'vosi"). Agar aniq sabab yo'q bo'lsa, faqat ism + "keys".
  - clientName: mijozning to'liq ismi (familiya + ism).
  - clientPhone: telefon raqami (+998... formatida, agar bo'lsa).
  - authority: murojaat organi. Faqat shu qiymatlardan biri yoki bo'sh:
      "raqobat-qomitasi" | "uchastkovoy" | "sud" | "direct" | "other".
      Matnda Raqobat qo'mitasi/uchastkovoy/sud aniq tilga olinmasa — "direct".

Faqat valid JSON qaytar (boshqa hech narsa, kod blok ham emas):
{"title":"...", "clientName":"...", "clientPhone":"...", "authority":"..."}

Matn:
---
`;

export async function parseClientInfo(rawText: string): Promise<ParsedClientInfo> {
  const ai = new GoogleGenAI({
    vertexai: true,
    project: process.env.VERTEX_PROJECT || "",
    location: process.env.VERTEX_LOCATION || "us-central1",
  });

  const response = await ai.models.generateContent({
    model: FLASH_MODEL,
    contents: [
      { role: "user", parts: [{ text: PROMPT + rawText.slice(0, 8000) }] },
    ],
    config: {
      temperature: 0,
      maxOutputTokens: 512,
      responseMimeType: "application/json",
    },
  });

  const raw = (response.text || "").trim();
  let parsed: Partial<ParsedClientInfo> = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Fallback: matnning birinchi qatorini title qil
    const firstLine = rawText.split("\n").find((l) => l.trim()) || "Yangi keys";
    parsed = { title: firstLine.trim().slice(0, 80) };
  }

  if (!parsed.title || !parsed.title.trim()) {
    parsed.title =
      (parsed.clientName && `${parsed.clientName} — keys`) || "Yangi keys";
  }

  return {
    title: parsed.title.trim().slice(0, 200),
    clientName: parsed.clientName?.trim() || undefined,
    clientPhone: parsed.clientPhone?.trim() || undefined,
    authority: parsed.authority?.trim() || undefined,
  };
}
