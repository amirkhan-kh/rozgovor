/**
 * Trigger scenario generation for Prosales company.
 * Calls the same logic as POST /api/scenarios/generate but bypasses HTTP auth.
 */
import { prisma } from "./src/utils/prisma";
import { GoogleGenAI } from "@google/genai";

const PROJECT = process.env.VERTEX_PROJECT || "big-quanta-469517-h6";
const LOCATION = process.env.VERTEX_LOCATION || "global";

const ai = new GoogleGenAI({
  vertexai: true,
  project: PROJECT,
  location: LOCATION,
});

type Category = "presale" | "qayta" | "sotuv" | "aftersale";

async function getTopTranscripts(companyId: string, category: Category, limit = 10) {
  const audioCat = category === "presale" ? "sotuv" : category === "aftersale" ? "qayta" : category;
  const audios = await prisma.audioFile.findMany({
    where: { companyId, category: audioCat, status: "done", transcription: { not: null } },
    select: {
      transcription: true,
      analysis: { select: { overallScore: true } },
    },
    take: 50,
  });
  return audios
    .filter((a) => a.transcription && (a.analysis?.overallScore ?? 0) >= 60)
    .sort((a, b) => (b.analysis?.overallScore ?? 0) - (a.analysis?.overallScore ?? 0))
    .slice(0, limit)
    .map((a) => a.transcription as string);
}

function buildPrompt(cat: Category, company: string, courseInfo: string | null, transcripts: string[]) {
  const catName = cat === "presale" ? "PRE-SALE (lid issitish)"
    : cat === "qayta" ? "QAYTA QO'NG'IROQ"
    : cat === "sotuv" ? "SOTUV (1-qo'ng'iroq)"
    : "AFTER-SALE (sotib olgandan keyin)";

  const examples = transcripts.length > 0
    ? `\n\nKomp top menejerlarning real qo'ng'iroqlari:\n${transcripts.slice(0, 5).map((t, i) => `\n=== Misol ${i + 1} ===\n${t.slice(0, 3000)}`).join("\n")}\n`
    : "";

  return `Sen sotuv senariy yozuvchisi. ${company} kompaniyasi uchun ${catName} senariyini yarat.

${courseInfo ? `KOMPANIYA MA'LUMOTI:\n${courseInfo}\n` : ""}
${examples}

Qaytar FAQAT toza JSON (Markdown yoki kommentar yo'q):
{
  "title": "Senariy sarlavhasi",
  "sections": [
    { "title": "1. Bo'lim nomi", "content": "Senariy matni (200-500 so'z, o'zbek tilida, professional ohang)" },
    { "title": "2. Keyingi bo'lim", "content": "..." }
  ]
}

Minimum 4-6 bo'lim. Har bo'limda aniq menejer gaplari, mijoz e'tirozlariga javoblar va keyingi qadamlar.`;
}

async function main() {
  const companyId = process.argv[2];
  if (!companyId) {
    console.error("Usage: ts-node generate-scenarios.ts <companyId>");
    process.exit(1);
  }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { name: true, courseInfo: true, username: true },
  });
  if (!company) { console.error("Company not found"); process.exit(1); }

  console.log(`[Scenarios] Company: ${company.name || company.username} (${companyId})`);

  const categories: Category[] = ["presale", "qayta", "sotuv", "aftersale"];
  const successes: string[] = [];
  const failures: string[] = [];

  for (const cat of categories) {
    console.log(`\n[Scenarios] Generating: ${cat}`);
    try {
      const transcripts = await getTopTranscripts(companyId, cat);
      console.log(`  ↳ ${transcripts.length} top transcripts found`);
      const prompt = buildPrompt(cat, company.name || company.username || "Kompaniya", company.courseInfo, transcripts);

      const resp = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { temperature: 0.6, responseMimeType: "application/json" },
      });
      const text = (resp.text || "{}").trim();
      const parsed = JSON.parse(text);

      if (!Array.isArray(parsed.sections) || parsed.sections.length === 0) {
        throw new Error("AI returned no sections");
      }

      await prisma.scenario.upsert({
        where: { companyId_category: { companyId, category: cat } },
        create: { companyId, category: cat, title: parsed.title, sections: parsed.sections, isEdited: false },
        update: { title: parsed.title, sections: parsed.sections, isEdited: false, generatedAt: new Date() },
      });
      console.log(`  ✓ ${cat}: "${parsed.title}" — ${parsed.sections.length} sections`);
      successes.push(cat);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ ${cat}: ${msg.slice(0, 200)}`);
      failures.push(cat);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log(`\n[DONE] ${successes.length}/${categories.length} succeeded: ${successes.join(", ")}`);
  if (failures.length > 0) console.log(`[FAILED] ${failures.join(", ")}`);
  process.exit(0);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
