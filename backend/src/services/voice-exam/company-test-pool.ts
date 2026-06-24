/**
 * Kompaniya testi savollar banki — Gemini orqali avtomatik generatsiya.
 *
 * Manba:
 *   - Company.courseInfo (markdown)
 *   - Company.topPerformerPlaybook (texnikalar, e'tiroz javoblari)
 *   - Company.scenarios (Scenario jadvalidan — sotuv senariylar)
 *
 * Natija: 50 ta multiple-choice savol (4 javob, correctIdx, explanation).
 * Bank haftada bir marta (yoki courseInfo o'zgarsa) yangilanadi va
 * Company.companyTestPool ga JSON sifatida saqlanadi.
 *
 * Har imtihonda shu bankdan 15 ta random savol tanlanadi va shuffle qilinadi.
 */
import { prisma } from "../../utils/prisma";
import { GoogleGenAI } from "@google/genai";

const MODEL = "gemini-2.5-pro";
const TARGET_COUNT = 50;

export interface CompanyTestQuestion {
  q: string;
  options: string[]; // har doim 4 ta
  correctIdx: number; // 0-3
  explanation: string;
  topic?: string; // qaysi mavzu (narx, jadval, mahsulot, e'tiroz, va h.k.)
}

function getAI(): GoogleGenAI {
  return new GoogleGenAI({
    vertexai: true,
    project: process.env.VERTEX_PROJECT || "big-quanta-469517-h6",
    location: process.env.VERTEX_LOCATION || "us-central1",
  });
}

function buildPrompt(company: {
  name: string;
  courseInfo: string | null;
  topPerformerPlaybook: any;
  scenarios: Array<{ title: string; category: string }>;
}): string {
  const playbook = company.topPerformerPlaybook
    ? JSON.stringify(company.topPerformerPlaybook).slice(0, 8000)
    : "";
  const scenariosTxt = company.scenarios
    .map((s) => `- [${s.category}] ${s.title}`)
    .join("\n");

  return `Sen "${company.name}" kompaniyasining ichki sotuv trening administratorisan.

VAZIFA: Sotuvchilar uchun kompaniya bilimini sinab ko'rish testini yarat — ${TARGET_COUNT} ta ko'p tanlovli savol.

MANBA — KOMPANIYA MA'LUMOTI:
${company.courseInfo || "(courseInfo bo'sh — playbook va senariylardan foydalan)"}

${playbook ? `TOP PERFORMER PLAYBOOK (eng yaxshi sotuvchi texnikalari):\n${playbook}\n` : ""}
${scenariosTxt ? `SENARIYLAR:\n${scenariosTxt}\n` : ""}

TEST QOIDALARI:
1. ${TARGET_COUNT} ta savol yarat — turli mavzularda muvozanatli (narx, mahsulot, jadval, e'tirozga javob, kompaniya tarixi/qoidalari, mijoz bilan ishlash)
2. Har savolda aynan 4 ta variant
3. Faqat 1 ta to'g'ri javob (correctIdx 0..3)
4. To'g'ri javob explanation — 1-2 jumla, MANBA dan iqtibos yoki sabab ko'rsat
5. Noto'g'ri variantlar ham real ko'rinishi kerak — chalg'ituvchi (distraktor)
6. Savol matni qisqa va aniq (1-2 jumla)
7. Mavzu (topic) — har savol uchun toifa: "narx", "mahsulot", "jadval", "e'tiroz", "qoida", "texnika", "boshqa"
8. O'zbek tilida tabiiy yoz, "aka/opa" deb murojaat shart emas (bu test, suhbat emas)
9. Savol darajasi turlicha — 30% oson (faktik), 50% o'rta (tushunish), 20% qiyin (vaziyat tahlili)
10. Faqat MANBA da bor narsalardan savol yarat — taxmin qilma

JSON FORMATI (faqat JSON qaytar, izohsiz):
{
  "questions": [
    {
      "q": "...",
      "options": ["A", "B", "C", "D"],
      "correctIdx": 0,
      "explanation": "...",
      "topic": "narx"
    },
    ...
  ]
}`;
}

/**
 * Gemini orqali ${TARGET_COUNT} savol generatsiya qiladi va Company.companyTestPool ga yozadi.
 */
export async function generateCompanyTestPool(
  companyId: string,
): Promise<{ count: number; updatedAt: Date }> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      name: true,
      courseInfo: true,
      topPerformerPlaybook: true,
      scenarios: { select: { title: true, category: true }, take: 30 },
    },
  });
  if (!company) throw new Error("Kompaniya topilmadi");

  if (!company.courseInfo && !company.topPerformerPlaybook && company.scenarios.length === 0) {
    throw new Error(
      "Kompaniya ma'lumoti yo'q. Avval Profile sahifasida kompaniya haqida ma'lumot kiriting.",
    );
  }

  const prompt = buildPrompt(company as any);
  const ai = getAI();

  const tryGenerate = async (model: string): Promise<string> => {
    const r = await ai.models.generateContent({
      model,
      contents: prompt,
      config: { temperature: 0.7, responseMimeType: "application/json" },
    });
    return r.text || "";
  };

  let text = "";
  let lastErr: any = null;
  const attempts = [
    { model: MODEL, waits: [0, 5000, 15000] },
    { model: "gemini-2.5-flash", waits: [0, 3000] },
  ];
  outer: for (const { model, waits } of attempts) {
    for (const wait of waits) {
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      try {
        text = await tryGenerate(model);
        if (text) break outer;
      } catch (e: any) {
        lastErr = e;
        const msg = e?.message || "";
        if (!msg.includes("429") && !msg.includes("RESOURCE_EXHAUSTED")) break;
      }
    }
  }
  if (!text) throw lastErr || new Error("AI dan javob kelmadi");

  // JSON ajratib olish
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("AI JSON formatida javob qaytarmadi");

  let parsed: any;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    throw new Error("AI javobini parse qilib bo'lmadi");
  }

  const rawQuestions: any[] = Array.isArray(parsed?.questions) ? parsed.questions : [];

  // Validatsiya — faqat to'g'ri formatdagi savollarni saqlaymiz
  const valid: CompanyTestQuestion[] = [];
  for (const q of rawQuestions) {
    if (
      typeof q?.q === "string" &&
      q.q.trim().length >= 5 &&
      Array.isArray(q.options) &&
      q.options.length === 4 &&
      q.options.every((o: any) => typeof o === "string" && o.trim().length > 0) &&
      typeof q.correctIdx === "number" &&
      q.correctIdx >= 0 &&
      q.correctIdx < 4 &&
      typeof q.explanation === "string"
    ) {
      valid.push({
        q: q.q.trim(),
        options: q.options.map((o: string) => o.trim()),
        correctIdx: q.correctIdx,
        explanation: q.explanation.trim(),
        topic: typeof q.topic === "string" ? q.topic.trim() : undefined,
      });
    }
  }

  if (valid.length < 15) {
    throw new Error(`AI faqat ${valid.length} ta yaroqli savol qaytardi (kerak: kamida 15)`);
  }

  const now = new Date();
  await prisma.company.update({
    where: { id: companyId },
    data: {
      companyTestPool: valid as any,
      companyTestPoolUpdatedAt: now,
    },
  });

  return { count: valid.length, updatedAt: now };
}

/**
 * Pool yo'q yoki bo'sh bo'lsa generatsiya qiladi. Pool bor bo'lsa o'sha qaytaradi.
 */
export async function ensureCompanyTestPool(
  companyId: string,
): Promise<CompanyTestQuestion[]> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { companyTestPool: true },
  });
  const pool = (company?.companyTestPool as CompanyTestQuestion[] | null) || [];
  if (Array.isArray(pool) && pool.length >= 15) return pool;
  await generateCompanyTestPool(companyId);
  const updated = await prisma.company.findUnique({
    where: { id: companyId },
    select: { companyTestPool: true },
  });
  return (updated?.companyTestPool as CompanyTestQuestion[] | null) || [];
}
