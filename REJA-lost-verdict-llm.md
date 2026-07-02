# TASK v3: "Yo'qotilgan lid — Manager haq/noxaq" verdiktni HAQIQIY LLM bahosiga o'tkazish (COUPLED)

> Loyiha: `D:\Projects\Work - AsosIt\SalesAI_Rozgovor\rozgovor`. Bu spec o'zicha tushunarli.
> **v2 ALLAQACHON BAJARILGAN** (`REJA-lost-verdict-fix-v2.md`) — hozirgi verdikt `rejection-info.ts`
> ichida DETERMINISTIK heuristika. Bu v3 — o'sha verdiktni **mavjud Gemini analizidan** keladigan
> haqiqiy LLM bahosiga ko'chiradi.
>
> **QAT'IY CHEKLOV:**
> - ❌ YANGI/ALOHIDA LLM chaqiruv YO'Q. ❌ Qayta STT YO'Q.
> - ✅ Mavjud analiz prompti (`call-analyzer.ts` Gemini 2.5 Pro / Flash 3) `<transcript>`ni ALLAQACHON
>   o'qiydi — unga CRM yopish sababi + bitta QO'SHIMCHA OUTPUT maydoni qo'shamiz → qo'shimcha xarajat ~nol.
> - ✅ Verdikt LLM maydoni MAVJUD bo'lsa undan, YO'Q bo'lsa (eski analizlar / sabab yo'q) v2 heuristikadan.

---

## Tasdiqlangan qarorlar (MAJBURIY — implementing agent shu bo'yicha ishlaydi)

1. **Prompt dizayni = COUPLED (tanlandi).** Gemini CRM yopish/rad sababini (`"<reason>"`) prompt orqali
   OLADI va to'g'ridan-to'g'ri hukm chiqaradi: shu sabab suhbatga qarab TO'G'RI qo'yilganmi.
   Yangi output: `closeReasonVerdict { status: "haq"|"noxaq"|"noaniq", reason: string }`.
   → *DECOUPLED variant (Gemini CRM tegini bilmasdan faqat `prospectQuality` chiqarib, backend solishtiradi)
   **RAD ETILDI** — bu rejada yo'q.*

2. **Backfill = GO-FORWARD (mavjud analizlarni HOZIR qayta yurgizmaymiz).** Yangi qo'ng'iroqlar maydonni
   avtomatik oladi. Mavjud 522 (lokal) analiz `closeReasonVerdict=null` bo'lib qoladi → ular v2 heuristik
   fallback bilan ishlaydi (buzilmaydi). To'liq backfill — **IXTIYORIY / keyinga qoldirilgan** (6b-bo'lim).

3. **PoC = Phase 0 (AVVAL bajarilishi SHART).** Migratsiya / prompt deploy'dan OLDIN ~10 real transkriptda
   verdikt sifati tekshiriladi (8-bo'lim). Sifat tasdiqlanmaguncha keyingi fazalar boshlanmaydi.

**Bajarilish tartibi:** Phase 0 (PoC) → Phase 1 (schema + prompt + reason-injection + backend kod) →
go-forward (yangi analizlar avtomatik) · Phase 2 backfill = ixtiyoriy/keyin.

---

## 0. Nega (kontekst)

v2'da verdikt to'liq deterministik: `conversationSubstance()` (duration, clientSpeech%, objections,
leadQuality, status) → `right/wrong/unclear`. Bu heuristika transkript **mazmunini** o'qimaydi.

Bu portalda CRM close/reject teglari FAQAT 4 ta operatsion teg: **"Noto'g'ri raqam"**, **"Chet el
raqami"**, **"Ariza qoldirmagan"**, **"Bepul xohladi"** — hammasi "bu lid mazmunli/haqiqiy emas edi"
degan da'vo. DB topilmasi (v2'da isbotlangan): bu teglar ko'pincha lid kiritish (intake) bosqichida
(`Lead.rejectReasonName`), qo'ng'iroqdan ~96 kun OLDIN qo'yilgan; kamroq — deal-close
(`SalesLead.closeReasonName`).

**LLM vazifasi (COUPLED):** CRM sababi `"<reason>"`ni ko'rsatib, SHU qo'ng'iroq transkriptiga qarab
sabab TO'G'RI qo'yilganmi deb hukm qildirish:
- Sabab suhbatga MOS (haqiqatan bo'sh/xato/mazmunsiz) → **haq** → Manager haq.
- Sabab MOS EMAS (real, qiziqqan mijoz "junk" bilan yopilgan) → **noxaq** → Manager noxaq (mis-tag).
- Chegaraviy / zaif signal / STT chalkash → **noaniq** → Aniqlab bo'lmadi.

`AudioFile.transcription` allaqachon saqlangan. Analiz **BATCH-ONLY** (Vertex) — per-file online loop TAQIQLANGAN.

---

## 0.1 Investigatsiya topilmalari (kod bilan tasdiqlangan — plan shu faktlarga tayanadi)

**A) Analiz prompti V2 default.** `call-analyzer.ts:1497` — `USE_PROMPT_V2 = process.env.USE_PROMPT_V2 !== "0"`.
Batch ham `USE_PROMPT_V2_BATCH` (`batch-backfill.ts:964`). Default holatda **`buildAnalysisPromptV2`**
(`call-analyzer.ts:241`) ishlatiladi — `{ systemInstruction, userMessage, responseSchema }` qaytaradi.
V1 `buildAnalysisPrompt` (`:632`) faqat `USE_PROMPT_V2=0`. **Asosiy ish V2'da**, V1 — ixtiyoriy (2.6).

**B) Per-audio prompt qurish joylari (2 ta):**
- Batch: `runStage3_ProBatch` (`batch-backfill.ts:970-1024`) — har `audio` uchun `getKnowledgeForAudio`
  + `buildAnalysisPromptV2(audio.transcription, cInfo.names, cat, courseInfo, playbook, null)` (`:981`).
- Online: `processor.ts:182` — `analyzeCall(transcription, criteriaText, category, criteriaNames,
  knowledgeContext, playbook)` → ichida `buildAnalysisPromptV2(...)` (`call-analyzer.ts:1514`).

**C) 🚩 CRM sabab analiz vaqtida MAVJUD EMAS (INJECTION CATCH — muhim):**
CRM yopish/rad sababi FAQAT read-time'da, controllerlarda `attachLeadCloseReasons(companyId, audios[])`
(`rejection-info.ts:192`) orqali join qilinadi (leadId/originalLeadId/phone → `Lead.rejectReasonName` /
`SalesLead.closeReasonName`). **Analiz paytida (batch yoki online) bu join CHAQIRILMAYDI.** Shuning uchun
COUPLED prompt uchun sababni analiz vaqtida OLIB KELISH kerak. Bu **drop-in EMAS**, 3 nozik nuqta bor:
  1. `attachLeadCloseReasons` audio obyektida `leadId`, `crmLeadId`, `phoneNumber` (+ `pipelineName`,
     `leadTags`, `isSale`) maydonlarini KUTADI. Batch'dagi `AudioMeta` (`batch-backfill.ts:1286-1293`) faqat
     `id/fileName/fileUrl/duration/managerName/category/transcription` tashiydi — `leadId/crmLeadId/
     phoneNumber` TASHLAB YUBORILADI. Ularni qo'shimcha select qilib olib kelish kerak.
  2. `attachLeadCloseReasons` — async, DB query. Batch'da buni butun ro'yxat uchun BIR MARTA chaqirib,
     `audioId → reason` map yasash kerak (u massivlarga mo'ljallangan, chunklaydi).
  3. Sabab ustuvorligi `getRejectionInfo` bilan bir xil bo'lsin: `leadRejectReasonName || closeReasonName`.
⚠️ **Semantik catch (5-bo'lim "Ma'lum cheklovlar"da ham):** intake JUNK teg (`Lead.rejectReasonName`)
qo'ng'iroqdan OLDIN qo'yilgani uchun analiz vaqtida MAVJUD → COUPLED bu teglar uchun ishlaydi. Ammo
deal-close sabab (`SalesLead.closeReasonName`) qo'ng'iroqdan KEYIN qo'yiladi → birinchi analiz vaqtida
ko'pincha YO'Q → maydon `null` → heuristik fallback (qayta analizgacha).

**D) Output parse va DB yozuv IKKI joyda (bir xil shakl):**
- Batch: `applyAnalysisFallbacks(rawText, ...)` (`:1155`) → `data = {...}` (`:1168-1205`) → `analysis.upsert` (`:1207`).
- Online: `analysisData = {...}` (`processor.ts:243-279`) → `analysis.upsert` (`:281`).
- Ikkalasi `clientProfile`ni bir xil pattern bilan yozadi — yangi maydon SHU patternni takrorlaydi.

**E) 🚩 STT-reuse (backfill arzonligi — GO-FORWARD tanlangani uchun ikkilamchi, ammo backfill kerak bo'lsa):**
`runStage3_ProBatch` (`batch-backfill.ts:933`) `audio.transcription`ni to'g'ridan-to'g'ri ishlatadi
(`:971-972`) — STT/Flash YO'Q. `scripts/reanalyze-pending-batch.js` shu yo'lni chaqiradi (`:66`). ⚠️
`runBatchBackfill` esa `transcription:null` bilan filtrlaydi (`:1266`) → transkripti bor audioni QAYTA
OLMAYDI, backfill uchun yaroqsiz.

**F) O'xshash maydon YO'Q.** `closeReasonVerdict`/`prospectQuality` va h.k. butun kodda topilmadi — yangi,
toza qo'shiladi. `clientProfile` — eng yaqin analog (transkriptdan chiqadigan `Json?` maydon).

---

## 1. Prisma — `backend/prisma/schema.prisma`, `Analysis` modeli

`clientProfile Json?` (`:366`) yoniga yangi maydon qo'sh:
```prisma
  clientProfile Json?

  // v3 — CRM yopish sababi bo'yicha LLM hukmi (COUPLED). Gemini transkript + CRM sababni o'qib to'ldiradi.
  // { status: "haq"|"noxaq"|"noaniq", reason: string }  — sabab yo'q bo'lsa null (→ heuristik fallback).
  closeReasonVerdict Json?
```
**Migratsiya RUXSAT ETILGAN** (v2'dan farqli). Lokalda:
```bash
cd backend
DATABASE_URL="postgresql://grafeas:grafeaslocal2026@localhost:5432/rozgovor_local" \
  npx prisma migrate dev --name add_close_reason_verdict
```
⚠️ Production'ga aniq so'ramasdan migrate YO'Q (CLAUDE.md).

---

## 2. `backend/src/services/call-analyzer.ts` — prompt + schema + parse + reason param

### 2.1 `CloseReasonVerdict` interfeysi + `AnalysisResult` (`:177-201`)
```ts
// ─── Close Reason Verdict (v3, COUPLED) — CRM sababi to'g'ri qo'yilganmi ────
interface CloseReasonVerdict {
  status: "haq" | "noxaq" | "noaniq"; // haq=sabab to'g'ri, noxaq=noto'g'ri (real lid), noaniq=aniq emas
  reason: string;                     // 1-2 jumla o'zbekcha — nega shunday hukm (shu suhbatga xos)
}
```
`AnalysisResult`ga (`voiceOfCustomer`dan keyin) qo'sh: `closeReasonVerdict?: CloseReasonVerdict;`

### 2.2 `buildAnalysisPromptV2` — YANGI `closeReason` parametri
Signatura (`:241-252`)ga 7-param qo'sh: `closeReason: string | null = null`.
`userMessage` (`:461-472`)da — sabab bor bo'lsagina — `<close_reason>` blok qo'sh:
```ts
  const closeReasonBlock = closeReason && closeReason.trim()
    ? `<close_reason>\nBu qo'ng'iroq CRM'da quyidagi sabab bilan YO'QOTILGAN/YOPILGAN deb belgilangan: "${closeReason.trim()}"\n</close_reason>\n\n`
    : "";
```
`userMessage`da `${leadBlock}`dan keyin `${closeReasonBlock}` qo'sh. `<task>` ichiga (sabab bor bo'lsagina
qo'shiladigan) ko'rsatma — 2.4 matni.

### 2.3 `buildAnalysisPromptV2` — `responseSchema` (`:481-623`), sabab bor bo'lsagina
`qualification` sxemasidan KEYIN (`:621`) `properties`ga shartli qo'sh (Vertex batch tuple type QABUL
QILMAYDI — `enum`/`nullable:true` ishlat, `:493-494` izohiga qara):
```ts
      // Faqat closeReason bo'lsa qo'shiladi (aks holda maydon so'ralmaydi):
      ...(closeReason && closeReason.trim() ? {
        closeReasonVerdict: {
          type: "object",
          required: ["status", "reason"],
          properties: {
            status: { type: "string", enum: ["haq", "noxaq", "noaniq"] },
            reason: { type: "string", minLength: 15 },
          },
        },
      } : {}),
```
⚠️ Yuqori top-level `required` ro'yxatiga (`:483`) QO'SHMA — audioda sabab bo'lmasligi mumkin.

### 2.4 Prompt ko'rsatma matni (`<task>` ichiga, sabab bor bo'lsagina)
```
- closeReasonVerdict: Yuqoridagi <close_reason> — CRM'da bu lidga qo'yilgan yopish/rad sababi. Transkriptni
  o'qib, shu sabab MANAGER TOMONIDAN TO'G'RI qo'yilganmi baho ber (4 ta operatsion teg):
  • "Noto'g'ri raqam" — mijoz "adashdingiz / bunday odam yo'q / noto'g'ri raqam" desa yoki umuman kerakli
    mijoz bo'lmasa → haq. Kerakli mijoz javob berib, mazmunli gaplashgan bo'lsa → noxaq.
  • "Chet el raqami" — suhbat xorij/chet el konteksti bilan tasdiqlansa → haq; aks holda → noxaq.
  • "Ariza qoldirmagan" — mijoz "men hech qanday ariza/zayavka qoldirmaganman, adashgansiz" desa → haq;
    lekin mijoz mahsulotga qiziqib, savol/ehtiyoj/e'tiroz bildirgan bo'lsa → noxaq (real lid).
  • "Bepul xohladi" — mijoz faqat bepul variantni so'rab, pulli xizmatga umuman rozi bo'lmasa → haq;
    narx/to'lov muhokama qilinib, sotib olish ehtimoli bo'lsa → noxaq.
  status: "haq" (sabab to'g'ri) | "noxaq" (sabab noto'g'ri — real lid mis-tag qilingan) | "noaniq"
    (transkriptdan aniq aytib bo'lmaydi — zaif signal, STT chalkash yoki suhbat juda qisqa).
  reason: 1-2 jumla o'zbekcha — nega shunday xulosaga kelding (shu suhbatga xos, shablon bo'lmasin).
  ⚠️ Yandex STT xatosini (bir necha noto'g'ri so'z) haqiqiy bo'sh/xato qo'ng'iroq bilan chalkashtirma.
```

### 2.5 `analyzeCall` (`:1499`) — `closeReason` parametrini o'tkazish
Signaturaga 8-param `closeReason: string | null = null` qo'sh; V2 shoxida `buildAnalysisPromptV2(...,
leadContext, closeReason)` (`:1514`) uzat; 429-retry rekursiyasiga (`:1558`) ham uzat.

### 2.6 (Ixtiyoriy) V1 `buildAnalysisPrompt` (`:632`, JSON example `:1075-1176`)
Faqat `USE_PROMPT_V2=0` bo'lsa. To'liqlik uchun sabab bor bo'lsa example'ga `closeReasonVerdict` qo'shsa
bo'ladi. **Past ustuvorlik** — V2 default.

### 2.7 `applyAnalysisFallbacks` (`:1298-1490`) — normalizatsiya
`voiceOfCustomer` fallbackdan keyin (`:1453` atrofi):
```ts
    // ─── closeReasonVerdict normalizatsiya (v3) ───────────────────────
    // Gemini qaytarmasa — undefined qoldiramiz (rejection-info heuristikaga tushadi).
    if (parsed.closeReasonVerdict) {
      const v = parsed.closeReasonVerdict as any;
      if (!["haq", "noxaq", "noaniq"].includes(v.status)) v.status = "noaniq";
      v.reason = typeof v.reason === "string" ? v.reason : "";
    }
```

---

## 3. CRM sababni analiz vaqtida OLIB KELISH + prompt'ga uzatish (0.1.C catch)

### 3.1 Batch — `runStage3_ProBatch` (`batch-backfill.ts:933-1024`)
1. `rejection-info`dan import: `import { attachLeadCloseReasons } from "../utils/rejection-info";`
2. `requests` loopidan OLDIN, audio idlar bo'yicha CRM sabab map yasang:
```ts
   const reasonRows = await prisma.audioFile.findMany({
     where: { id: { in: audios.map((a) => a.id) } },
     select: { id: true, leadId: true, crmLeadId: true, phoneNumber: true,
               pipelineName: true, leadTags: true, isSale: true },
   });
   const withReasons = await attachLeadCloseReasons(companyId, reasonRows);
   const reasonByAudio = new Map<string, string | null>(
     withReasons.map((r: any) => [r.id, r.leadRejectReasonName || r.closeReasonName || null])
   );
```
3. `buildAnalysisPromptV2` chaqiruvida (`:981`) 7-argument uzat:
   `buildAnalysisPromptV2(audio.transcription, cInfo.names, cat, courseInfo, playbook, null,
   reasonByAudio.get(audio.id) || null)`.
   (V1 shoxi `:1003` — sabab bo'lsa `buildAnalysisPrompt`ga ham uzatsa bo'ladi, ixtiyoriy.)

### 3.2 Online — `processor.ts` (`:182`)
`audioFile` (`:30` `findUnique`) to'liq qator → `leadId/crmLeadId/phoneNumber` MAVJUD. `analyzeCall`dan OLDIN:
```ts
   const { attachLeadCloseReasons } = await import("../utils/rejection-info");
   const [withReason] = await attachLeadCloseReasons(audioFile.companyId, [audioFile]);
   const closeReason =
     (withReason as any)?.leadRejectReasonName || (withReason as any)?.closeReasonName || null;
```
`analyzeCall(transcription, criteriaText, audioFile.category, criteriaNames, knowledgeContext,
playbook, null, closeReason)` — 7-si `leadContext` (hozir yo'q → `null`), 8-si `closeReason`.
> ⚠️ Semantik catch (0.1.C): online analiz qo'ng'iroqdan darrov keyin ishlaydi → deal-close sabab
> ko'pincha hali YO'Q. Intake JUNK teg bo'lsa keladi. Sabab yo'q → `null` → heuristik fallback.

---

## 4. DB yozuv — 2 joy

### 4.1 `batch-backfill.ts` `runStage3_ProBatch` `data` (`:1168-1205`)
`clientProfile: ...` (`:1202-1204`)dan keyin:
```ts
        closeReasonVerdict: (result as any).closeReasonVerdict
          ? (JSON.parse(JSON.stringify((result as any).closeReasonVerdict)) as any)
          : null,
```

### 4.2 `processor.ts` `analysisData` (`:243-279`)
`clientProfile: ...` (`:277-279`)dan keyin:
```ts
      closeReasonVerdict: (analysisResult as unknown as { closeReasonVerdict?: unknown }).closeReasonVerdict
        ? JSON.parse(JSON.stringify((analysisResult as unknown as { closeReasonVerdict?: unknown }).closeReasonVerdict))
        : null,
```

---

## 5. `backend/src/utils/rejection-info.ts` — verdiktni LLM maydoniga ulash

### 5a. `rejectionAnalysisSelect` (`:29-40`) — 1 maydon qo'sh
```ts
  requiresFollowup: true,
  closeReasonVerdict: true,   // v3 — LLM hukmi
};
```
(audio.controller getAll/getOne + audit.controller getLostVerdicts → uch joyga avtomatik yetkaziladi.)

### 5b. `getRejectionInfo` (`:96-171`) — LLM-first, TO'G'RIDAN-TO'G'RI map + heuristik fallback

`reason`/`matchConfidence`/`reasonSource`/`s` hisoblangandan KEYIN, mavjud status blokini (`:107-118`)
quyidagi bilan almashtir:
```ts
  const v = an?.closeReasonVerdict as { status?: "haq" | "noxaq" | "noaniq"; reason?: string } | null | undefined;
  const hasVerdict = !!v && typeof v.status === "string" && ["haq", "noxaq", "noaniq"].includes(v.status);

  let status: "right" | "wrong" | "unclear";
  let conclusion: string;

  if (hasVerdict) {
    // ── LLM YO'LI (v3, COUPLED) — to'g'ridan-to'g'ri map ──────────────
    status = v!.status === "haq" ? "right" : v!.status === "noxaq" ? "wrong" : "unclear";
    conclusion = String(v!.reason || "").replace(/\s+/g, " ").trim()
      || `"${reason}" sababi bo'yicha LLM hukmi: ${v!.status}.`;
  } else {
    // ── HEURISTIK FALLBACK (v2 — O'ZGARMAYDI) ──────────────────────
    if (s.emptyCall) {
      status = "right";
    } else if (reasonSource === "deal" && s.strongConversation && matchConfidence === "id") {
      status = "wrong";
    } else {
      status = "unclear";
    }
    conclusion = /* v2'dagi mavjud jonli conclusion bloki — o'zgarishsiz ko'chiriladi */ "";
  }
```
> ⚙️ **Amaliy qadam:** mavjud `:120-168` (verdictLabel + jonli conclusion) blokini heuristik shoxiga
> (`else`) ko'chir; `verdictLabel` hisobini status'dan KEYIN, ikkala shoxdan tashqarida qoldir:
> ```ts
> const verdictLabel =
>   status === "wrong" ? "Manager noxaq" :
>   status === "right" ? "Manager haq" : "Aniqlab bo'lmadi";
> return { reason, reasonSource, status, verdictLabel, conclusion, matchConfidence };
> ```

**Map jadvali (LLM yo'li):** `haq → right → "Manager haq"` · `noxaq → wrong → "Manager noxaq"` ·
`noaniq → unclear → "Aniqlab bo'lmadi"`. `conclusion = verdict.reason` (jonli, har-audioga-xos).
> Eslatma: LLM yo'lida `matchConfidence`/`reasonSource` GATE emas — Gemini transkript + sababni bevosita
> baholagan (v2'dagi "faqat deal-close wrong bo'ladi" cheklovi shu yo'lda qo'llanmaydi). Ular qaytariladigan
> obyektda saqlanadi (frontend/insight uchun). Heuristik fallback shoxida esa v2 guardlari O'ZGARMAYDI.

---

## 6. FRONTEND (minimal)

- Verdikt/label mantiqi backend'da. Frontend `verdictLabel` + `conclusion`ni ALLAQACHON ko'rsatadi (v2).
  Shakl bir xil (`reason, reasonSource, status, verdictLabel, conclusion, matchConfidence`) — backend
  verdikt mantiqi **o'zgarmaydi**.
- (Ixtiyoriy, keyin) "baho manbasi" (LLM/heuristika) belgisi — bu rejaga kirmaydi.

### 6.1 "Qayta ishlanadigan lidlar" framing (BOTH — verdikt + imkoniyat)

> **Tasdiqlangan qaror (framing = BOTH):** "Manager noxaq" verdikti QOLADI (backend tegilmaydi), lekin UI'da
> bu bir vaqtning o'zida **"Qayta ishlanadigan lid"** (recoverable lead) imkoniyati sifatida ham ko'rsatiladi.
> Sabab: PoC ~80% bu junk teglar HAQIQATAN noto'g'ri (real lidlar tashlab yuborilgan) ekanini ko'rsatdi —
> shuning uchun yuqori "noxaq" soni AYBLOV emas, IMKONIYAT sifatida o'qilishi kerak.
> ⚠️ **YANGI backend verdikt mantiqi YO'Q** — bu faqat mavjud `status==="wrong"` (noxaq) ustidagi UI/label qatlami.

**(a) `AudioDetailPage.tsx` — rejection kartasi:** `status==="wrong"` (noxaq) bo'lganda verdikt yoniga
**"♻️ Qayta ishlanadigan lid"** badge/callout qo'sh (mavjud `conclusion` matnidan tashqari). Qisqa izoh:
"Real, qiziqqan mijoz — junk qilib yopilgan; qaytarib ishlansa bo'ladi." Ranglar mavjud noxaq uslubidan.

**(b) Audit `LostVerdictPie` + 🚩 ro'yxat:** noxaq segmentini imkoniyat sifatida framing qil:
- Subtitle / legend izoh: **"Noto'g'ri junk qilingan — qaytarish mumkin"**.
- Aggregate ko'rsatkich: **"Qaytariladigan lidlar: N"** (N = `status==="wrong"` soni — mavjud
  `getLostVerdicts` breakdown'dagi `wrong`/"Manager noxaq" sonidan olinadi, yangi so'rov shart emas).

**Chegara:** faqat `status==="wrong"` (LLM `noxaq` yoki heuristik `wrong`) uchun. `right`/`unclear`
o'zgarmaydi. Backend `getRejectionInfo`/`getLostVerdicts` — tegilmaydi (faqat frontend prezentatsiya).

---

## 6b. Backfill (Phase 2 — IXTIYORIY / keyinga qoldirilgan)

> **Tasdiqlangan qaror #2 = GO-FORWARD.** Mavjud analizlar HOZIR qayta yurgizilmaydi — ular
> `closeReasonVerdict=null` bilan heuristik fallback'da ishlaydi (buzilmaydi). Tarixiy qo'ng'iroqlarda
> LLM verdikt kerak bo'lganda (kelajakda), `scripts/reanalyze-pending-batch.js` andozasidagi **Pro-batch**
> bilan qayta yurgiziladi (STT reuse — 0.1.E). Bu — **majburiy emas**, kerak bo'lganda bajariladi.

Kerak bo'lgan holatda amaliy skript (`scripts/backfill-close-reason-verdict.js` — YANGI,
`reanalyze-pending-batch.js` nusxasi):
1. `closeReasonName`/`leadRejectReasonName` bor + `Analysis.closeReasonVerdict = null` + `status="done"`
   audiolarni top (yo'qotilgan-lid signali bor qism).
2. `status="pending"` qil (transkript SAQLANADI).
3. `AudioMeta` (transkript bilan) yig'ib `runStage3_ProBatch(...)` chaqir — u 3.1'dagi reason-injection
   bilan yangi maydonni to'ldiradi. `status` avtomat `done`ga qaytadi (`:1212`).
⚠️ `runBatchBackfill` (STT'li) ISHLATILMAYDI — `transcription:null` filtri sabab (0.1.E).

---

## 7. Cost izohi

- **Yangi qo'ng'iroqlar (go-forward):** ~nol qo'shimcha — analiz allaqachon ishlaydi; `closeReasonVerdict`
  bir necha qo'shimcha OUTPUT token (2 enum/bool + 1-2 jumla). Sabab join (`attachLeadCloseReasons`) —
  arzon DB query (LLM emas).
- **Backfill (agar qilinsa):** faqat Stage 3 Pro batch output tokenlari. STT/Flash YO'Q (0.1.E).

---

## 8. Phase 0 — PoC (MAJBURIY, AVVAL bajarilishi shart)

> **Tasdiqlangan qaror #3:** birinchi bosqich. Migratsiya (1) va prompt deploy (2)dan OLDIN. PoC uchun
> schema o'zgarishi shart emas — natijani DB'ga yozmasdan, `generateContent` javobini ko'z bilan tekshir.

1. `Analysis` + `AudioFile.transcription` bor, `closeReasonName`/`leadRejectReasonName` belgilangan
   ~10 audio tanla (aralash: aniq xato-raqam/junk + aniq real suhbat + har 4 tegdan).
2. Har biri uchun CRM sababni (`attachLeadCloseReasons`) olib, `buildAnalysisPromptV2(..., reason)` →
   bitta online `generateContent` (lokal probe skript, scratchpad).
3. `closeReasonVerdict.status` + `reason`ni ko'z bilan tekshir: real suhbatlar "noxaq", xato-raqam/bo'shlar
   "haq" chiqyaptimi; `reason` har audioda FARQ qilyaptimi (shablon emas); har 4 teg mantiqan baholanyaptimi.
4. Sifat yaxshi bo'lsagina Phase 1 boshlanadi.

---

## Ma'lum cheklovlar (COUPLED + GO-FORWARD oqibatlari)

- **Stale verdikt (COUPLED):** hukm analiz vaqtidagi CRM sababiga asoslanadi va DB'da saqlanadi. Agar CRM
  sababi keyinchalik O'ZGARSA, saqlangan `closeReasonVerdict` eskiradi — faqat qayta analizda yangilanadi.
- **Deal-close sabab analiz vaqtida yo'q (COUPLED):** `SalesLead.closeReasonName` qo'ng'iroqdan KEYIN
  qo'yiladi → online analiz vaqtida ko'pincha MAVJUD EMAS → maydon `null` → qayta analizgacha heuristik.
  Intake JUNK teg (`Lead.rejectReasonName`) esa oldin qo'yilgani uchun keladi.
- **Tarixiy qo'ng'iroqlar (GO-FORWARD):** mavjud 522 (va prod) analiz backfill qilinmaguncha verdikt
  HEURISTIKAdan chiqadi (LLM emas). To'liq LLM qamrov faqat backfill (6b) bajarilsa.

---

## 9. Tekshirish (verification)

Lokal DB: `postgresql://grafeas:grafeaslocal2026@localhost:5432/rozgovor_local`. Prisma client:
`backend/node_modules/@prisma/client`.
1. **Migratsiya:** `npx prisma migrate dev --name add_close_reason_verdict` — xatosiz; ustun paydo bo'ladi.
2. **Build:** `cd backend && npx tsc --noEmit` + `cd frontend && npm run build` — xatosiz.
3. **Unit:** `call-analyzer.test.ts` — `applyAnalysisFallbacks`: maydon YO'Q → `undefined`/xatosiz;
   noto'g'ri `status` → "noaniq"ga normallashtiriladi.
4. **rejection-info probe** (v2'dagi `db-verdict-probe.cjs` andozasida, scratchpad):
   - `closeReasonVerdict` bor analiz → status to'g'ridan-to'g'ri map (5b jadvali), `conclusion=reason`;
   - `closeReasonVerdict=null` → v2 heuristik natija (regressiya yo'q);
   - `conclusion` LLM `reason`dan kelganda har audioda FARQ (bir nechta namuna ko'z bilan).
5. **Go-forward tekshiruv:** intake JUNK teg + transkript bor audioni `pending` qilib, `runStage3_ProBatch`
   (yoki online) orqali qayta analiz → `closeReasonVerdict` to'ladi; STT log YO'Q (faqat `[Stage 3]`).
6. **E2E:** `GET /api/audio/:id` → `analysis.rejectionInfo.conclusion` LLM matni; `GET /api/audio?
   rejectionReason=all` va audit `lost-verdicts` breakdown yangi verdiktlar (Manager haq/noxaq/Aniqlab bo'lmadi).

---

## 10. NIMA QILMASLIK

- ❌ YANGI/alohida LLM chaqiruv (verdikt uchun mustaqil so'rov). ❌ Qayta STT / qayta Flash.
- ❌ DECOUPLED variant (backend solishtirish) — RAD ETILDI.
- ❌ `runBatchBackfill` (STT'li)ni backfill uchun ishlatish (`transcription:null` filtri).
- ❌ `conversationSubstance` formulalarini o'zgartirish — heuristik fallback O'ZGARMAY qoladi.
- ❌ `closeReasonVerdict`ni V2 top-level `required`ga qo'shish (sabab bo'lmasligi mumkin).
- ❌ Tuple type schema'da (`["string","null"]`) — Vertex batch qabul qilmaydi; `enum`/`nullable:true`.
- ❌ Production'ga so'rovsiz migrate/deploy. ❌ `judgeSkipped`/`judgeOverridden`ga tegish.

---

## 11. Tegiladigan fayllar

| Fayl | O'zgarish |
|------|-----------|
| `backend/prisma/schema.prisma` | `Analysis.closeReasonVerdict Json?` + migratsiya |
| `backend/src/services/call-analyzer.ts` | `CloseReasonVerdict` interfeys; `AnalysisResult` +maydon; `buildAnalysisPromptV2` +`closeReason` param (block+task+schema shartli); `analyzeCall` +param; `applyAnalysisFallbacks` normalizatsiya; (ixt.) V1 |
| `backend/src/services/batch-backfill.ts` | `runStage3_ProBatch`: `attachLeadCloseReasons` import + reason map + `buildAnalysisPromptV2` +arg; `data` +`closeReasonVerdict` |
| `backend/src/services/processor.ts` | `attachLeadCloseReasons` single-audio join → `analyzeCall` +arg; `analysisData` +`closeReasonVerdict` |
| `backend/src/utils/rejection-info.ts` | `rejectionAnalysisSelect` +`closeReasonVerdict`; `getRejectionInfo` LLM-first to'g'ridan-to'g'ri map + heuristik fallback |
| `backend/scripts/backfill-close-reason-verdict.js` | (IXTIYORIY/keyin) `reanalyze-pending-batch.js` andozasida, STT'siz |
| `backend/src/services/call-analyzer.test.ts` | (ixt.) yangi maydon uchun test |
| `frontend/src/pages/audio/AudioDetailPage.tsx` | (§6.1a) `status==="wrong"` → "♻️ Qayta ishlanadigan lid" badge/callout |
| `frontend/src/pages/audit/components/LostVerdictPie.tsx` | (§6.1b) noxaq framing: "Noto'g'ri junk qilingan — qaytarish mumkin" + "Qaytariladigan lidlar: N" |
| `frontend/* (boshqa)` | verdikt shakli bir xil — majburiy boshqa o'zgarish YO'Q |

**Maqsad:** yo'qotilgan-lid verdikti endi CRM sababi + transkript MAZMUNiga asosan Gemini tomonidan
bevosita chiqadi (COUPLED, qo'shimcha xarajatsiz); sabab yo'q / eski analizlar heuristik fallback bilan
buzilmaydi (go-forward); backfill — ixtiyoriy, saqlangan transkriptni reuse qilib arzon.
