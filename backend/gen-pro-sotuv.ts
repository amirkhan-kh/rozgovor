import { prisma } from "./src/utils/prisma";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  vertexai: true,
  project: "big-quanta-469517-h6",
  location: "global",
});

async function main() {
  const companyId = "cmoocj60x000011y0b7wfmphw";
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true, courseInfo: true } });

  const audios = await prisma.audioFile.findMany({
    where: { companyId, category: "sotuv", status: "done", transcription: { not: null } },
    select: { transcription: true, analysis: { select: { overallScore: true } } },
    take: 50,
  });
  const transcripts = audios
    .filter(a => a.transcription && (a.analysis?.overallScore ?? 0) >= 60)
    .sort((a, b) => (b.analysis?.overallScore ?? 0) - (a.analysis?.overallScore ?? 0))
    .slice(0, 10)
    .map(a => a.transcription as string);

  const prompt = `Sen sotuv senariy yozuvchisi. ${company?.name} kompaniyasi uchun SOTUV (1-qo'ng'iroq) senariysini yarat.

${company?.courseInfo ? `KOMPANIYA MA'LUMOTI:\n${company.courseInfo}\n` : ""}

Real menejer qo'ng'iroqlari (top scoring):
${transcripts.slice(0, 5).map((t, i) => `\n=== Misol ${i+1} ===\n${t.slice(0, 3000)}`).join("\n")}

Qaytar FAQAT toza JSON:
{"title": "...", "sections": [{"title": "1. ...", "content": "..."}]}
Minimum 4-6 bo'lim. Har bo'limda menejer gaplari, e'tirozlarga javoblar.`;

  console.log("[Pro 2.5] Generating sotuv (comparison)...");
  const t0 = Date.now();
  const resp = await ai.models.generateContent({
    model: "gemini-2.5-pro",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: { temperature: 0.6, responseMimeType: "application/json" },
  });
  const dur = ((Date.now() - t0) / 1000).toFixed(1);
  const parsed = JSON.parse(resp.text || "{}");

  await require("fs").writeFileSync("/tmp/pro25_sotuv.json", JSON.stringify(parsed.sections, null, 2));
  console.log(`[Pro 2.5] ${dur}s, ${parsed.sections.length} sections, title: ${parsed.title}`);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
