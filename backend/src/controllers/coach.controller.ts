import { Request, Response } from "express";
import { readFileSync } from "fs";
import { join } from "path";
import { GoogleGenAI } from "@google/genai";
import { prisma } from "../utils/prisma";
import { success, error } from "../utils/response";

const COACH_MODEL = "gemini-3-flash-preview";

// Kitob matnini bir marta yuklash
let knowledgeBase = "";
try {
  knowledgeBase = readFileSync(
    join(__dirname, "../../knowledge_base/way_of_the_wolf_uz.md"),
    "utf-8"
  );
} catch {
  console.error("[Coach] Knowledge base topilmadi");
}

const getClient = (): GoogleGenAI =>
  new GoogleGenAI({
    vertexai: true,
    project: process.env.VERTEX_PROJECT || "",
    location: process.env.VERTEX_LOCATION || "global",
  });

/**
 * STABLE system instruction — bu matn har chaqiruvda BIR XIL bo'ladi.
 * Gemini 2.5 Pro implicit prefix caching shuni cache qiladi (5 daqiqa TTL,
 * minimum 2048 token) — natijada kitob va qoidalar qayta yuborilmaydi,
 * input xarajati 70% gacha tejaydi.
 *
 * MUHIM: ichida dinamik ma'lumot (menejer ismi, tahlil raqamlari) bo'lmasligi kerak.
 * Dinamik tahlil alohida `contents` ichida yuboriladi.
 */
function buildStableSystemInstruction(): string {
  return `Sen AI maslahatchi — sotuvchilar jamoasi uchun chuqur, aniq va shaxsiylashtirilgan coaching beradigan ustoz.

BILIMING:
- Jordan Belfort "Bo'ri yo'li" (Straight Line Selling) — to'liq kitob matni
- Menejerning HAQIQIY tahlil ma'lumotlari (foydalanuvchi xabarida beriladi)
- Boshqa menejerlar bilan taqqoslash statistikasi
- Kompaniyaning eng yaxshi ustozlari (sifat va miqdor ustalari) ish uslubi

═══════════════════════════════════════════════════
KITOB (Jordan Belfort "Bo'ri yo'li" — to'liq matn):
${knowledgeBase}
═══════════════════════════════════════════════════

🛑 BIRINCHI QOIDA: "TRANSKRIPTNI O'QING, TAHLILNI KO'R-KO'RONA TAKRORLAMANG"

Tahlil tag'lari (errors, criticalMoments) BA'ZAN NOTO'G'RI bo'lishi mumkin. Misol:
- Tahlilda "E'tirozga taslim bo'ldi" deb yozilishi mumkin
- LEKIN real snippet ko'rsatsa: mijoz "vaqtim yo'q, soat 8da qo'ng'iroq qiling" dedi va menejer "xo'p, soat 8da qo'ng'iroq qilaman" deb javob berdi
- Bu TASLIM emas — bu MUVAFFAQIYATLI CALLBACK kelishuvi

Har critical moment uchun snippet berilgan bo'lsa, uni MAJBURAN o'qing va o'zingiz xulosa chiqaring:
1. Mijoz nima dedi? (kontekstni to'liq oling)
2. Menejer qanday javob berdi?
3. Suhbat keyingi qadam bilan tugadimi yoki bo'sh tugadimi?
4. Bu HAQIQATAN xato emi yoki to'g'ri ish edi?

Agar tahlil noto'g'ri bo'lsa — to'g'risini ayt: "Bu yerda tahlil sizni noto'g'ri ayblagan. Aslida siz to'g'ri ish qildingiz, chunki..."

🎯 IKKINCHI QOIDA: "ANIQ EVIDENCE QOIDASI"

Coaching bergan har gal — agar real xato bo'lsa — SHU 4 ELEMENTNI birlashtir:

1. ⚠️ ANIQ DAQIQA — qaysi qo'ng'iroqda, qaysi vaqtda, menejer NIMA aytgan
   Misol: "[12:34] Mijoz e'tiroz aytdi, siz aytdingiz: 'mayli, oylab koring'"
   → "ANIQ DAQIQALAR" bo'limidan iqtibos kel

2. 👥 JAMOA TAQQOSLASH — boshqa menejerlar shu xatoga qancha tez-tez yo'l qo'yyapti
   Misol: "Bu sizning shaxsiy muammongiz emas — jamoaning 7/12 menejeri (58%) ham shu xatoga yo'l qo'yyapti, lekin 14 DAVRON 0% — chunki..."
   → "ENG KO'P XATOLAR" bo'limidagi jamoa foizidan foydalan

3. 📖 KITOBDAN ANIQ TEXNIKA — Bo'ri yo'lidan SPECIFIC bob/texnika
   Misol: "Bo'ri yo'lining Looping (Doiraviy texnika) bobida aytilganidek, e'tirozni qaytarmaslik kerak — uni AYNAN AYTTIRISH kerak. Belfort bunda shunday so'raydi: 'Bu sizga aniq qaysi nuqtadan shubhali?'"
   → KITOB matnidan haqiqiy texnika/iqtibos olib kel

4. 🏆 USTOZLAR NAMUNASI — sifat va miqdor ustalari shu vaziyatda NIMA QILADI
   Misol: "Davron (eng yuqori konversiya) shu daqiqada 'Tushunaman, lekin sizga aniq qaysi qismi qiyin?' deb so'raydi. Elyor (eng ko'p sotuv) bunday vaziyatda 30 sekund ichida 'Mayli, sizga keyinroq qo'ng'iroq qilaman' deb keyingisiga o'tadi."
   → "SIFAT USTASI" va "MIQDOR USTASI" bo'limidagi REAL iqtiboslarni ishlat

═══════════════════════════════════════════════════

❌ ASLO BUNDAY YOZMA:
- "Davron sizdan biroz balandroq, undan o'rganing" (faqat raqam — ANIQLIK YO'Q)
- "E'tirozga taslim bo'lmang" (umumiy maslahat — TEXNIKA YO'Q)
- "Kitobda shunday yozilgan" (umumiy havola — IQTIBOS YO'Q)
- "Yaxshi ishlayapsiz, davom eting" (bo'sh maqtov — TAHLIL YO'Q)

✅ HAR DOIM SHUNDAY YOZ:
- "Sizning [05:23] daqiqangizda mijoz 'qimmat' dedi va siz 'mayli oylang' bilan tugatdingiz. Bu jamoaning 8/12 menejeri qiladigan xato. Lekin Davron shu vaziyatda hech qachon tushib qolmaydi — u 'Tushunaman, lekin aynan qaysi qism — narxmi, davomiyligi, sifatmi?' deb so'raydi. Bo'ri yo'lining 'Looping' bobida aynan shu texnika tasvirlangan: e'tirozni umumiy holatda qabul qilmang, KONKRET sababni so'rang."

═══════════════════════════════════════════════════

📐 JAVOB TUZILMASI (qat'iy template)

💪 AGAR "ZO'R QILGAN DAQIQALARINGIZ" BO'LIMI BERILGAN BO'LSA:
Javobingizni MAJBURAN shu bo'lim bilan BOSHLANG — ijobiy motivatsiya oldin, xatolar keyin.

## 💪 Zo'r qilgan joylaringiz

**[MM:SS](audio:CALL_ID)** — Texnika nomi
> "Real iqtibos"
Nima yaxshi bo'ldi: qisqa tushuntirish

(1-3 ta golden moment, har biriga alohida blok)

───────────────────────────────────────────────────

Har xato uchun MAJBURAN quyidagi 5 ta sub-bo'lim bo'lsin (har birini alohida qatorga, **qalin** label bilan):

### 1-XATO: [Qisqa nom]

**📍 Aniq daqiqa:** [00:46](audio:CALL_ID) — bu yerda nima sodir bo'ldi (1 jumla)

> "Menejer aytgan iborasi" (markdown blockquote sifatida)

**👥 Jamoa holati:** N/M menejer (P%) shu xatoga yo'l qo'yyapti

**📖 Bo'ri yo'li texnikasi:** Texnika nomi va qisqa tushuntirish

> "Kitobdan iqtibos" (yana blockquote)

**🏆 Sifat ustasi shunday qiladi:** Ustoz nomi (real iqtiboslar bilan)

> "Ustozning real iborasi"

(Bo'sh qator)

### 2-XATO: ...

(Xuddi shu format)

═══════════════════════════════════════════════════

📝 SCRIPT BO'LIMI

Oxirida — "## Bu hafta amaliyot" sarlavhasi ostida 3 ta script ber:

### Script 1: [Vaziyat nomi]

\`\`\`
Mijoz: "..."
Siz: "..."
\`\`\`

═══════════════════════════════════════════════════

⏱ TIMESTAMP LINK FORMATI (juda muhim — qat'iy):

Har gal qo'ng'iroqdagi aniq daqiqani ko'rsatayotganda — uni MAJBURAN markdown link sifatida yoz:

   [MM:SS](audio:CALL_ID)

CALL_ID ni "ANIQ DAQIQALAR" bo'limidagi CALL_ID dan ol. Misol:

   **Aniq daqiqa:** [00:46](audio:cmnabc123xyz) Mijoz "vaqtim yo'q" dedi
   **Aniq daqiqa:** [11:20](audio:cmndef456) Suhbat yakunida...

Bu link foydalanuvchini real audioga, aynan o'sha daqiqaga olib boradi. Hech qachon timestamp'ni oddiy [00:46] formatda qoldirma — har doim (audio:CALL_ID) qo'sh.

═══════════════════════════════════════════════════

QOLGAN QOIDALAR:
1. Salom deyishga 1-2 jumla bilan javob ber
2. O'zbek tilida, tabiiy ustoz tilida gaplash
3. Trening so'ralgandagina to'liq trening yoz
4. Jadval ISHLATMA — oddiy ro'yxat ishlat
5. Sarlavhalar: ## yetarli
6. Iqtiboslarni "tirnoq" ichida yoki > markdown'i bilan
7. Code block (\`\`\`) script misollar uchun mumkin
8. Emoji kam — faqat key bloklarda`;
}

/**
 * Transkriptdan ma'lum bir [MM:SS] daqiqa atrofidagi ±30 sekundlik
 * snippet'ni ajratib oladi (taxminan 6-10 qator).
 *
 * Bu coach AI'ga real kontekstni beradi — u faqat tag'larga emas,
 * haqiqiy matnga qarab xulosa chiqarishi uchun.
 */
function timestampToSec(ts: string): number {
  const m = ts.match(/(\d{1,2}):(\d{2})/);
  if (!m) return 0;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

function extractTranscriptSnippet(transcription: string, timestamp: string): string {
  if (!transcription || !timestamp) return "";
  const target = timestampToSec(timestamp);
  if (!target) return "";

  const lines = transcription.split("\n").filter((l) => l.trim());
  const lineRe = /^\[(\d{1,2}):(\d{2})\]/;

  // Topilgan daqiqaning qator indexini aniqlash
  let centerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(lineRe);
    if (!m) continue;
    const sec = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    if (sec >= target) {
      centerIdx = i;
      break;
    }
  }
  if (centerIdx === -1) return "";

  // ±5 qator (taxminan 30 sekund kontekst)
  const start = Math.max(0, centerIdx - 5);
  const end = Math.min(lines.length, centerIdx + 8);
  return lines.slice(start, end).join("\n");
}

/**
 * Top performer playbook'ni AI uchun matn formatda yozadi —
 * texnikalar, e'tiroz javoblari, yopilish uslubi, kalit iboralar.
 * Real iqtibos bilan, AI o'sha so'zlarni keltiradi.
 */
function formatPlaybookBlock(label: string, p: Record<string, any>): string {
  if (!p) return "";
  const techniques = (p.techniques || []) as Array<{ name: string; example: string; frequency?: string }>;
  const objections = (p.objectionHandling || []) as Array<{ objectionType: string; response: string }>;
  const phrases = (p.keyPhrases || []) as string[];

  const techBlock = techniques.length
    ? techniques.map((t) => `  • ${t.name}${t.frequency ? ` (${t.frequency})` : ""}: "${t.example}"`).join("\n")
    : "  • (texnikalar topilmadi)";

  const objBlock = objections.length
    ? objections.map((o) => `  • ${o.objectionType}: "${o.response}"`).join("\n")
    : "  • (e'tiroz javoblari topilmadi)";

  const phrasesBlock = phrases.length
    ? phrases.slice(0, 6).map((q) => `"${q}"`).join(" · ")
    : "—";

  return `=== ${label} ===
Menejer: ${p.managerName}
Konversiya: ${p.conversionRate}% · Sotuvlar: ${p.salesCount}/${p.totalCalls} · QA ball: ${p.avgQaScore || "?"}/100
Nutq nisbati: menejer ${p.avgManagerSpeech || "?"}% / mijoz ${p.avgClientSpeech || "?"}%

ASOSIY TEXNIKALAR (real iboralar — AI bularni IQTIBOS sifatida ishlatishi shart):
${techBlock}

E'TIROZGA JAVOB BERISH USULI:
${objBlock}

YAKUNLASH USLUBI: ${p.closingStyle || "—"}

KALIT IBORALAR: ${phrasesBlock}`;
}

// Menejer tahlil ma'lumotlarini yig'ish
async function getManagerContext(managerId: string | null, companyId: string) {
  if (!managerId || managerId === "all") {
    // Umumiy jamoa tahlili
    const managers = await prisma.manager.findMany({
      where: { companyId, isActive: true },
      select: { id: true, name: true },
    });

    const allAnalyses = await prisma.analysis.findMany({
      where: { audioFile: { companyId } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        overallScore: true,
        criteria: true,
        errors: true,
        objections: true,
        lossPoints: true,
        winPoints: true,
        audioFile: { select: { manager: { select: { name: true } } } },
      },
    });

    if (allAnalyses.length === 0) return "Hali tahlil ma'lumotlari yo'q.";

    const avgScore = Math.round(allAnalyses.reduce((s, a) => s + a.overallScore, 0) / allAnalyses.length);

    // Menejerlar bo'yicha o'rtacha
    const managerScores: Record<string, number[]> = {};
    const allErrors: Record<string, number> = {};

    for (const a of allAnalyses) {
      const name = a.audioFile.manager?.name || "Noma'lum";
      if (!managerScores[name]) managerScores[name] = [];
      managerScores[name].push(a.overallScore);

      const errors = a.errors as Array<{ type: string }>;
      for (const e of errors) {
        allErrors[e.type] = (allErrors[e.type] || 0) + 1;
      }
    }

    const managerAvgs = Object.entries(managerScores).map(([name, scores]) => ({
      name,
      avg: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
      count: scores.length,
    })).sort((a, b) => a.avg - b.avg);

    const topErrors = Object.entries(allErrors).sort((a, b) => b[1] - a[1]).slice(0, 5);

    // Company top performer playbook (ikki ustoz bilan)
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { topPerformerPlaybook: true },
    });
    const playbookRaw = company?.topPerformerPlaybook as Record<string, any> | null;
    const byConversion = playbookRaw?.byConversion || playbookRaw;
    const byVolume = playbookRaw?.byVolume || null;
    const balanced = playbookRaw?.balanced || null;

    let playbookBlock = "";
    if (byConversion) {
      playbookBlock = `\n\n${formatPlaybookBlock("SIFAT USTASI (eng yuqori konversiya)", byConversion)}`;
    }
    if (byVolume) {
      playbookBlock += `\n\n${formatPlaybookBlock("MIQDOR USTASI (eng ko'p sotuv)", byVolume)}`;
    }
    if (balanced) {
      playbookBlock += `\n\n${formatPlaybookBlock("BALANSLI USTOZ (ikkalasida ham yuqori)", balanced)}`;
    }

    return `JAMOA TAHLILI:
- Jami menejerlar: ${managers.length}
- Tahlil qilingan: ${allAnalyses.length} qo'ng'iroq
- Jamoa o'rtacha balli: ${avgScore}/100

MENEJERLAR REYTINGI (QA ball bo'yicha):
${managerAvgs.map((m, i) => `${i + 1}. ${m.name}: ${m.avg}/100 (${m.count} qo'ng'iroq)`).join("\n")}

ENG KO'P XATOLAR:
${topErrors.map(([type, count]) => `- ${type}: ${count} marta`).join("\n")}${playbookBlock}`;
  }

  // Bitta menejer tahlili
  const manager = await prisma.manager.findUnique({
    where: { id: managerId },
    select: { name: true },
  });
  if (!manager) return "Menejer topilmadi.";

  const analyses = await prisma.analysis.findMany({
    where: { audioFile: { managerId } },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      id: true,
      overallScore: true,
      criteria: true,
      errors: true,
      objections: true,
      lossPoints: true,
      winPoints: true,
      summary: true,
      coachingInsights: true,
      audioFile: { select: { id: true, fileName: true, transcription: true } },
      // Validator agent chiqargan toza ma'lumot (mavjud bo'lsa)
      cleanedAnalysis: {
        select: {
          confidenceScore: true,
          cleanedErrors: true,
          cleanedMoments: true,
          evidenceQuotes: true,
        },
      },
    },
  });

  if (analyses.length === 0) return `${manager.name} uchun tahlil ma'lumotlari yo'q.`;

  const avgScore = Math.round(analyses.reduce((s, a) => s + a.overallScore, 0) / analyses.length);

  const criteriaScores: Record<string, number[]> = {};
  const allErrors: Record<string, { count: number; descriptions: string[] }> = {};
  const allObjections: Record<string, number> = {};
  const lossPoints: string[] = [];
  const criticalMoments: Array<{ callId: string; timestamp: string; whatHappened: string; whatManagerDid: string; whatToDoInstead: string; technique?: string; transcriptSnippet?: string }> = [];

  let cleanedCount = 0;
  for (const a of analyses) {
    const criteria = a.criteria as Record<string, { score: number }>;
    for (const [name, val] of Object.entries(criteria)) {
      if (!criteriaScores[name]) criteriaScores[name] = [];
      criteriaScores[name].push(val.score);
    }

    // Validator tozalagan ma'lumot afzal — agar mavjud bo'lsa
    const cleaned = a.cleanedAnalysis;
    const hasCleaned = cleaned && cleaned.confidenceScore >= 0;
    if (hasCleaned) cleanedCount += 1;

    const errors = (hasCleaned
      ? (cleaned.cleanedErrors as Array<{ type: string; description?: string }>)
      : (a.errors as Array<{ type: string; description?: string }>)) || [];

    for (const e of errors) {
      if (!allErrors[e.type]) allErrors[e.type] = { count: 0, descriptions: [] };
      allErrors[e.type].count += 1;
      if (e.description && allErrors[e.type].descriptions.length < 3) {
        allErrors[e.type].descriptions.push(e.description);
      }
    }
    const objections = a.objections as Array<{ type: string; count: number }>;
    for (const o of objections) allObjections[o.type] = (allObjections[o.type] || 0) + o.count;
    const losses = a.lossPoints as Array<{ description: string }>;
    for (const l of losses.slice(0, 2)) lossPoints.push(l.description);

    // Critical moments — Validator tozalagan bo'lsa undan ol, aks holda coachingInsights'dan
    const momentsSrc: Array<any> = hasCleaned
      ? (cleaned.cleanedMoments as Array<any>) || []
      : ((a.coachingInsights as any)?.criticalMoments as Array<any>) || [];

    for (const m of momentsSrc.slice(0, 2)) {
      if (criticalMoments.length < 6) {
        const snippet = extractTranscriptSnippet(a.audioFile.transcription || "", m.timestamp || "");
        criticalMoments.push({
          callId: a.audioFile.id,
          timestamp: m.timestamp || "?",
          whatHappened: m.whatHappened || "",
          whatManagerDid: m.whatManagerDid || "",
          whatToDoInstead: m.whatToDoInstead || "",
          technique: m.technique,
          transcriptSnippet: snippet,
        });
      }
    }
  }

  // Debug: qancha analysis Validator bilan tozalangan
  if (cleanedCount > 0) {
    console.log(`[Coach] ${cleanedCount}/${analyses.length} analysis validated by Validator Agent`);
  }

  // ─── GOLDEN MOMENTS (Pattern Miner Agent natijasi) ──────────────────────
  // Menejerning yutuqli daqiqalarini ko'rsatish — ijobiy motivatsiya uchun.
  const goldenMoments = await prisma.goldenMoment.findMany({
    where: { managerId },
    orderBy: { createdAt: "desc" },
    take: 6,
    select: {
      audioFileId: true,
      timestamp: true,
      technique: true,
      quote: true,
      whyItWorked: true,
    },
  });

  const avgCriteria = Object.entries(criteriaScores).map(([name, scores]) => ({
    name,
    avg: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
  })).sort((a, b) => a.avg - b.avg);

  const topErrorEntries = Object.entries(allErrors).sort((a, b) => b[1].count - a[1].count).slice(0, 5);
  const topObjections = Object.entries(allObjections).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // ─── JAMOA TAQQOSLASHI: shu xatolarni boshqa menejerlar ham qiladimi? ─
  const teamErrorStats: Record<string, { totalManagers: number; managersWithError: number; teamPercent: number }> = {};
  if (topErrorEntries.length > 0) {
    const teamAnalyses = await prisma.analysis.findMany({
      where: { audioFile: { companyId, managerId: { not: null, notIn: [managerId] } } },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { errors: true, audioFile: { select: { managerId: true } } },
    });

    const otherManagerIds = new Set<string>();
    const errorByManager: Record<string, Set<string>> = {};
    for (const a of teamAnalyses) {
      const mid = a.audioFile.managerId!;
      otherManagerIds.add(mid);
      const errors = a.errors as Array<{ type: string }>;
      for (const e of errors) {
        if (!errorByManager[e.type]) errorByManager[e.type] = new Set();
        errorByManager[e.type].add(mid);
      }
    }
    const totalOthers = otherManagerIds.size;
    for (const [type] of topErrorEntries) {
      const withErr = errorByManager[type]?.size || 0;
      teamErrorStats[type] = {
        totalManagers: totalOthers,
        managersWithError: withErr,
        teamPercent: totalOthers > 0 ? Math.round((withErr / totalOthers) * 100) : 0,
      };
    }
  }

  // Top errors with descriptions + team comparison
  const topErrorsBlock = topErrorEntries.map(([type, data]) => {
    const team = teamErrorStats[type];
    const teamLine = team
      ? ` · jamoaning ${team.managersWithError}/${team.totalManagers} menejeri (${team.teamPercent}%) ham shu xatoga yo'l qo'yyapti`
      : "";
    const examples = data.descriptions.length > 0
      ? `\n  Misollar:\n${data.descriptions.map((d) => `   • "${d}"`).join("\n")}`
      : "";
    return `- ${type}: ${data.count} marta${teamLine}${examples}`;
  }).join("\n");

  const criticalMomentsBlock = criticalMoments.length > 0
    ? `\n\nANIQ DAQIQALAR (eng aniq evidence — bularni majburan iqtibos qil):
${criticalMoments.map((m, i) => `[${i + 1}] CALL_ID=${m.callId} TIMESTAMP=${m.timestamp}
  Tahlilda yozilgan: ${m.whatHappened}
  Menejer aytdi (tahlildan): "${m.whatManagerDid}"
  Aslida shunday qilish kerak edi (tahlildan): "${m.whatToDoInstead}"${m.technique ? `\n  Texnika: ${m.technique}` : ""}
  ${m.transcriptSnippet ? `
  ─── REAL TRANSKRIPT SNIPPET (±30 sekund kontekst — MAJBURAN o'qing va tahlil bilan SOLISHTIRING):
${m.transcriptSnippet.split("\n").map((l) => "  " + l).join("\n")}
  ───────────────────────────────────────────` : ""}`).join("\n\n")}

⚠ MUHIM TASDIQLASH QOIDASI:
Tahlil tag'lari ba'zan noto'g'ri bo'lishi mumkin. Coaching berish OLDIDAN, har critical moment uchun snippet'ni o'qing va o'zingiz xulosa chiqaring:

✋ "TASLIM BO'LISH" (surrender) faqat agar:
   - Mijoz e'tiroz aytdi VA
   - Menejer hech qanday javob bermay tugatdi VA
   - Hech qanday keyingi qadam (qayta qo'ng'iroq, sana, kelishuv) belgilanmadi

✅ AGAR mijoz "vaqtim yo'q, X soatda qayta qo'ng'iroq qiling" desa va menejer rozi bo'lsa — bu MUVAFFAQIYAT, taslim emas! "Bu yerda yaxshi ishladingiz" deb yozing.

✅ AGAR mijoz oilasi bilan maslahat so'rasa va menejer aniq deadline bilan callback ber'sa — bu BANT followup, taslim emas.

❌ AGAR tahlilda "surrender" deb yozilgan bo'lsa, lekin snippet ko'rsatsa — siz haqiqatni aytishingiz kerak, tahlilni MAJBURAN takrorlamang.

⚠ TIMESTAMP LINK FORMATI:
Javobingda har timestamp'ni majburan shu formatda yoz:
   [${criticalMoments[0]?.timestamp || "MM:SS"}](audio:${criticalMoments[0]?.callId || "CALL_ID"})
Misol: "**Aniq daqiqa:** [00:46](audio:cmn123abc) Mijoz e'tiroz aytdi..."`
    : "";

  // Top performer playbook — kompaniya darajasida (ikki ustoz)
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { topPerformerPlaybook: true },
  });
  const playbookRaw = company?.topPerformerPlaybook as Record<string, any> | null;
  const byConversion = playbookRaw?.byConversion || playbookRaw;
  const byVolume = playbookRaw?.byVolume || null;
  const balanced = playbookRaw?.balanced || null;

  // Sales conversion (isSale)
  const salesFiles = await prisma.audioFile.findMany({
    where: { managerId, status: "done" },
    select: { isSale: true },
    take: 100,
  });
  const totalCalls = salesFiles.length;
  const salesCount = salesFiles.filter((f) => f.isSale).length;
  const conversionRate = totalCalls > 0 ? Math.round((salesCount / totalCalls) * 100) : 0;

  let eliteGapBlock = "";

  // Sifat ustasi (Davron tipidagi)
  if (byConversion && byConversion.managerId !== managerId) {
    eliteGapBlock += `\n\n${formatPlaybookBlock("SIFAT USTASI — eng yuqori konversiya", byConversion)}`;
    eliteGapBlock += `\n\n${manager.name} vs ${byConversion.managerName}:
- ${manager.name}: ${avgScore}/100 QA ball, ${conversionRate}% konversiya
- ${byConversion.managerName}: ${byConversion.avgQaScore || "?"}/100 QA ball, ${byConversion.conversionRate}% konversiya
- Nutq nisbati: ${manager.name} (tahlil talab qiladi) vs ${byConversion.managerName} (${byConversion.avgManagerSpeech || "?"}% menejer)`;
  }

  // Miqdor ustasi (eng ko'p sotuv chiqargan)
  if (byVolume && byVolume.managerId !== managerId) {
    eliteGapBlock += `\n\n${formatPlaybookBlock("MIQDOR USTASI — eng ko'p sotuv", byVolume)}`;
    eliteGapBlock += `\n\n${manager.name} vs ${byVolume.managerName}:
- ${byVolume.managerName} har kuni ko'p qo'ng'iroq qiladi (${byVolume.totalCalls} ta) va ${byVolume.salesCount} ta sotuv chiqargan
- Uning kuchi: tezlik, hajm, energiya — bir mijozda uzoq qolib ketmaydi`;
  }

  // Balansli ustoz (ham konversiyada, ham hajmda yaxshi)
  if (balanced && balanced.managerId !== managerId) {
    eliteGapBlock += `\n\n${formatPlaybookBlock("BALANSLI USTOZ — ikkalasida ham yuqori", balanced)}`;
    eliteGapBlock += `\n\n${manager.name} vs ${balanced.managerName}:
- ${balanced.managerName} ${balanced.conversionRate}% konversiya VA ${balanced.salesCount} sotuv — barcha ko'rsatkichda ikkinchi yoki uchinchi
- Uning kuchi: BALANS — sifat va hajmni birga olib boradi`;
  }

  // ─── GOLDEN MOMENTS BLOCK ───────────────────────────────────────────────
  // Menejerning yutuqli daqiqalari — Coach ijobiy motivatsiya berishi uchun.
  const goldenMomentsBlock = goldenMoments.length > 0
    ? `\n\nZO'R QILGAN DAQIQALARINGIZ (Pattern Miner natijasi — Coach MAJBURAN shu ma'lumotlardan "💪 Zo'r qilgan joylaringiz" bo'limini chiqaradi):
${goldenMoments.map((g, i) =>
  `[${i + 1}] CALL_ID=${g.audioFileId} TIMESTAMP=${g.timestamp}
  Texnika: ${g.technique}
  Iqtibos: "${g.quote}"
  Nega ishladi: ${g.whyItWorked}`).join("\n\n")}

⚠ COACH QOIDASI: Javobingizda har doim xatolar bo'limidan OLDIN "💪 Zo'r qilgan joylaringiz" bo'limini yozing. Bu ijobiy motivatsiya beradi.

Format:
## 💪 Zo'r qilgan joylaringiz

**[MM:SS](audio:CALL_ID)** — Texnika nomi
> "Real iqtibos"
Nima yaxshi bo'ldi: qisqa tushuntirish

(Keyin xatolar bo'limiga o'ting)`
    : "";

  return `MENEJER: ${manager.name}
TAHLIL: ${analyses.length} qo'ng'iroq | O'rtacha ball: ${avgScore}/100
SOTUV KONVERSIYASI: ${salesCount}/${totalCalls} (${conversionRate}%)

MEZONLAR BO'YICHA BALL:
${avgCriteria.map((c) => `- ${c.name}: ${c.avg}/100${c.avg < 60 ? " ⚠️ ZAIF" : ""}`).join("\n")}

ENG KO'P XATOLAR (jamoa bilan taqqoslangan):
${topErrorsBlock || "Yo'q"}

E'TIROZLAR:
${topObjections.map(([type, count]) => `- ${type}: ${count} marta`).join("\n") || "Yo'q"}

YO'QOTISH NUQTALARI:
${lossPoints.slice(0, 5).map((l) => `- ${l}`).join("\n") || "Yo'q"}
${criticalMomentsBlock}
${eliteGapBlock}
OXIRGI SUHBAT XULOSALARI:
${analyses.slice(0, 3).map((a) => `- [${a.overallScore}/100] ${a.summary}`).join("\n")}${goldenMomentsBlock}`;
}

// Menejerlar ro'yxati
export const getCoachOverview = async (req: Request, res: Response): Promise<void> => {
  try {
    const managers = await prisma.manager.findMany({
      where: { companyId: req.companyId, isActive: true },
      select: {
        id: true,
        name: true,
        _count: { select: { audioFiles: true } },
      },
    });

    // Har bir menejerning o'rtacha ballini hisoblash
    const result = await Promise.all(
      managers.map(async (m) => {
        const analyses = await prisma.analysis.findMany({
          where: { audioFile: { managerId: m.id } },
          select: { overallScore: true },
          take: 20,
          orderBy: { createdAt: "desc" },
        });
        const avgScore = analyses.length > 0
          ? Math.round(analyses.reduce((s, a) => s + a.overallScore, 0) / analyses.length)
          : 0;
        return {
          id: m.id,
          name: m.name,
          totalFiles: m._count.audioFiles,
          avgScore,
          totalAnalyses: analyses.length,
        };
      })
    );

    result.sort((a, b) => b.avgScore - a.avgScore);
    success(res, result);
  } catch (err) {
    error(res, "Ma'lumot olishda xatolik");
  }
};

// Chat endpoint — Claude bilan suhbat
export const chat = async (req: Request, res: Response): Promise<void> => {
  try {
    const { messages, managerId } = req.body;
    // messages: Array<{ role: "user" | "assistant", content: string }>

    const context = await getManagerContext(managerId || null, req.companyId!);

    const client = getClient();

    // STABLE: kitob + qoidalar + javob formati — bir xil, implicit caching maqsadi.
    const stableSystem = buildStableSystemInstruction();

    // DYNAMIC: menejer tahlili — faqat shu menejer uchun, har chaqiruvda yangi.
    const dynamicContext = `═══════════════════════════════════════════════════
SHU SUHBAT UCHUN AKTUAL TAHLIL:
═══════════════════════════════════════════════════

${context}

═══════════════════════════════════════════════════

Yuqoridagi tahlilni o'qib oldim. Endi foydalanuvchi savoliga javob beraman —
majburan "ANIQ DAQIQALAR" iqtiboslari, jamoa foizi, kitob texnikasi va ustoz namunasi bilan.`;

    const history = (messages || []).map((m: any) => ({
      role: m.role === "assistant" ? ("model" as const) : ("user" as const),
      parts: [{ text: m.content }],
    }));

    // systemInstruction — Gemini prefix caching'i uchun alohida kanal.
    // Dynamic tahlil va chat tarixi `contents` ichida yuboriladi.
    const response = await client.models.generateContent({
      model: COACH_MODEL,
      contents: [
        { role: "user", parts: [{ text: dynamicContext }] },
        {
          role: "model",
          parts: [
            {
              text: "Tahlilni o'qib bo'ldim. Menejerning aniq daqiqalari, jamoa taqqoslashi va ustozlar playbooki tayyor. Savolingizga javob beraman.",
            },
          ],
        },
        ...history,
      ],
      config: {
        temperature: 0.3,
        maxOutputTokens: 4096,
        systemInstruction: { role: "system", parts: [{ text: stableSystem }] },
      },
    });

    const reply = response.text || "";

    success(res, { reply });
  } catch (err: any) {
    console.error("Coach chat error:", err?.message || err);
    error(res, "AI bilan bog'lanishda xatolik");
  }
};

/* ==================== CHAT HISTORY ==================== */

// Suhbatlar ro'yxati
// Manager rolida bo'lsa, faqat o'zining suhbatlarini ko'rishi kerak.
// Admin (company) — barcha suhbatlarni ko'radi.
function chatScopeWhere(req: Request) {
  const where: { companyId: string; managerId?: string } = { companyId: req.companyId! };
  if (req.userRole === "manager" && req.managerId) {
    where.managerId = req.managerId;
  }
  return where;
}

export const getChatSessions = async (req: Request, res: Response): Promise<void> => {
  try {
    const sessions = await prisma.chatSession.findMany({
      where: chatScopeWhere(req),
      select: { id: true, title: true, managerId: true, createdAt: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });
    success(res, sessions);
  } catch (err) {
    error(res, "Suhbatlar olishda xatolik");
  }
};

// Bitta suhbat
export const getChatSession = async (req: Request, res: Response): Promise<void> => {
  try {
    const session = await prisma.chatSession.findFirst({
      where: { id: req.params.id, ...chatScopeWhere(req) },
    });
    if (!session) { error(res, "Suhbat topilmadi", 404); return; }
    success(res, session);
  } catch (err) {
    error(res, "Suhbat olishda xatolik");
  }
};

// Yangi suhbat yaratish
export const createChatSession = async (req: Request, res: Response): Promise<void> => {
  try {
    const { managerId } = req.body;
    // Manager rolida — har doim o'zining ID'si bilan yoziladi (boshqa managerni tanlash imkonsiz)
    const ownerManagerId =
      req.userRole === "manager" && req.managerId ? req.managerId : managerId || null;
    const session = await prisma.chatSession.create({
      data: {
        companyId: req.companyId!,
        managerId: ownerManagerId,
        title: "Yangi suhbat",
        messages: JSON.stringify([]),
      },
    });
    success(res, session);
  } catch (err) {
    error(res, "Suhbat yaratishda xatolik");
  }
};

// Suhbatni yangilash (xabarlar qo'shish)
export const updateChatSession = async (req: Request, res: Response): Promise<void> => {
  try {
    const { messages, title, managerId } = req.body;
    const data: { updatedAt: Date; messages?: string; title?: string; managerId?: string | null } = {
      updatedAt: new Date(),
    };
    if (messages !== undefined) data.messages = JSON.stringify(messages);
    if (title !== undefined) data.title = title;
    // Manager rolida managerId'ni o'zgartirib bo'lmaydi (o'zinikidan boshqaga olib o'tolmaydi)
    if (managerId !== undefined && req.userRole !== "manager") data.managerId = managerId;

    const session = await prisma.chatSession.updateMany({
      where: { id: req.params.id, ...chatScopeWhere(req) },
      data,
    });
    success(res, { updated: session.count });
  } catch (err) {
    error(res, "Suhbat yangilashda xatolik");
  }
};

// Suhbatni o'chirish
export const deleteChatSession = async (req: Request, res: Response): Promise<void> => {
  try {
    await prisma.chatSession.deleteMany({
      where: { id: req.params.id, ...chatScopeWhere(req) },
    });
    success(res, { deleted: true });
  } catch (err) {
    error(res, "Suhbat o'chirishda xatolik");
  }
};

// Eski endpointlar backward compatibility uchun
export const getAdvice = async (req: Request, res: Response): Promise<void> => {
  const { managerId } = req.params;
  req.body = {
    managerId,
    messages: [{ role: "user", content: "Bu menejerning zaif tomonlarini tahlil qilib, kitobdan aniq maslahatlar ber." }],
  };
  return chat(req, res);
};

export const generateTraining = async (req: Request, res: Response): Promise<void> => {
  const { managerId } = req.params;
  const { focus } = req.body;
  req.body = {
    managerId,
    messages: [{ role: "user", content: `Bu menejer uchun "${focus || "umumiy"}" mavzusida to'liq trening tayyorla.` }],
  };
  return chat(req, res);
};
