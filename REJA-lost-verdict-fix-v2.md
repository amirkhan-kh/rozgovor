# TASK v2: "Yo'qotilgan lid — Manager haq/noxaq" — 3 ta nuqsonni tuzatish

> Loyiha: `D:\Projects\Work - AsosIt\SalesAI_Rozgovor\rozgovor`. Bu spec o'zicha tushunarli.
> **v1 ALLAQACHON BAJARILGAN** (`rejection-info.ts` substance-based verdikt bor). Bu — uning
> **ustidan** mavjud kodni MODIFIKATSIYA qilish. `REJA-lost-verdict-fix.md` = v1 (kontekst uchun).
> **QAT'IY CHEKLOV:** ❌ Vertex/Gemini/yangi analiz YO'Q. ✅ Faqat mavjud `Analysis`+`AudioFile`
> maydonlari (deterministik).

## 0. Nega (user feedback + DB topilma)

v1 render bo'ladi, lekin 3 nuqson:
1. **Label noto'g'ri:** "Teg to'g'ri/noto'g'ri" yozilgan. To'g'risi — **"Manager haq / Manager noxaq"**
   (funksiya managerni baholaydi, tegni emas).
2. **Xulosa statik:** `conclusion` — barcha audiolar uchun deyarli bir xil shablon (faqat daqiqa/%
   almashadi). Har audioning **haqiqiy** `followupReason`/`followupPhrase`/`lossPoints` (kontekst)
   ishlatilmagan.
3. **"Noxaq" juda ko'p (74.8%).** DB tekshiruvi (isbotlangan): **"noxaq"larning 100%i intake
   JUNK tegidan** (`Lead.rejectReasonName`), `SalesLead.closeReasonName` (deal-close) dan EMAS.
   Teg qo'ng'iroqdan ~96 kun OLDIN qo'yilgan, **82/83 lid `statusId=JUNK`, 100% `isConverted=false`,
   0 tasi dealga o'tган**. Ya'ni bu real "manager qo'ng'iroqni noto'g'ri yopdi" emas — eski intake teg
   keyingi qo'ng'iroqqa `leadId` bo'yicha ulanib qolган (lifecycle/join artefakti).

**Yechim tamoyili:** intake-lid tegini (JUNK, dealga o'tmagan, qo'ng'iroqdan oldin qo'yilган)
manager verdikti sifatida ISHLATMAYMIZ. "Manager noxaq" faqat **contemporaneous deal-close**
(`SalesLead.closeReasonName`) sababida chiqadi. Intake teglar → "Aniqlab bo'lmadi" (lekin har
audioga xos foydali izoh bilan — "bu lid junk qilingan, lekin real suhbat bo'lган" kabi).

---

## 1. O'zgarishlar — BACKEND `backend/src/utils/rejection-info.ts`

### 1a. `reasonSource` biriktirish (`attachLeadCloseReasons`, ~269-301)
Reason qaysi manbadan kelganini biriktir (allaqachon `matchConfidence` biriktiriladi, yoniga qo'sh):
```ts
const reasonSource: "deal" | "lead" | null =
  crmLead?.rejectReasonName ? "lead" :        // Lead.rejectReasonName = intake
  dealLead?.closeReasonName ? "deal" : null;  // SalesLead.closeReasonName = deal-close
```
Natija obyektiga `reasonSource` qo'sh. `leadStatusId`/`isJunkLead` allaqachon biriktiriladi —
qoldir (ular ham kerak bo'ladi).

### 1b. `rejectionAnalysisSelect` (~29-38) — 2 maydon qo'sh
Xulosani boyitish uchun: `followupPhrase: true`, `lossPoints: true` **qo'sh** (qolganini qoldir).

### 1c. `getRejectionInfo` (~94-163) — verdikt gating + jonli xulosa

**Verdikt qarori (YANGI — reasonSource gating):**
```ts
const reasonSource: "deal" | "lead" = audio?.reasonSource === "deal" ? "deal" : "lead";
const s = conversationSubstance(an, audio);
const matchConfidence = audio?.matchConfidence === "id" ? "id" : "phone";

let status: "right" | "wrong" | "unclear";
if (s.emptyCall) {
  status = "right";                       // suhbat bo'lmagan → teg to'g'ri (manager haq)
} else if (reasonSource === "deal" && s.strongConversation && matchConfidence === "id") {
  status = "wrong";                       // FAQAT real deal-close sababida noxaq bo'lishi mumkin
} else {
  status = "unclear";                     // intake teg + real suhbat / chegaraviy → Aniqlab bo'lmadi
}
```
> Natija: intake-lid teglari (100% hozirgi "noxaq") endi "wrong" bo'lmaydi → "noxaq" real
> darajaga (deyarli 0) tushadi. Deal-close mismatch bo'lsa (kam) — hali ushlanadi.

**Label (YANGI):**
```ts
const verdictLabel =
  status === "wrong" ? "Manager noxaq" :
  status === "right" ? "Manager haq" :
  "Aniqlab bo'lmadi";
```

**Jonli, har-audioga-xos xulosa (YANGI — statik shablon O'RNIGA):** haqiqiy analiz matnidan foydalan.
```ts
const compact = (v: any, n = 220) => String(v || "").replace(/\s+/g, " ").trim().slice(0, n);
const lossPoints = Array.isArray(an.lossPoints) ? an.lossPoints : [];
const objTypes = (Array.isArray(an.objections) ? an.objections : [])
  .map((o: any) => o?.type).filter(Boolean).join(", ");
const durMin = Math.round((Number(audio?.duration) || 0) / 60);

// Har audioning O'ZIGA XOS kontekst iboralari (bo'sh bo'lmaganlarini yig'amiz):
const ctxBits: string[] = [];
if (an.followupReason)  ctxBits.push(`yo'qotish sababi — ${compact(an.followupReason)}`);
if (an.followupPhrase)  ctxBits.push(`mijoz iborasi: "${compact(an.followupPhrase, 160)}"`);
if (lossPoints[0]?.description) ctxBits.push(`kritik nuqta — ${compact(lossPoints[0].description)}`);
if (objTypes) ctxBits.push(`e'tirozlar: ${objTypes}`);
const ctxText = ctxBits.slice(0, 2).join("; "); // 1-2 ta eng muhim, jonli qism

let conclusion: string;
if (status === "wrong") {
  conclusion =
    `Manager dealni "${reason}" sababi bilan yopgan, lekin ${durMin} daqiqalik suhbat mazmunli ` +
    `(lid sifati "${an.leadQuality || "-"}", mijoz nutqi ${an.clientSpeech || 0}%)` +
    (ctxText ? `: ${ctxText}` : ``) + `. Yopilish sababi suhbatga mos kelmaydi.`;
} else if (status === "right") {
  conclusion =
    `"${reason}" to'g'ri qo'yilgan: mazmunli suhbat aniqlanmadi ` +
    `(${audio?.status || "-"}, ${Number(audio?.duration) || 0}s, mijoz nutqi ${an.clientSpeech || 0}%).`;
} else { // unclear
  if (reasonSource === "lead" && s.realConversation) {
    // intake JUNK teg + real suhbat — foydali insight, ayblovsiz
    conclusion =
      `"${reason}" — lid kiritish bosqichida qo'yilgan teg (JUNK), aniq shu qo'ng'iroqning ` +
      `yopilish sababi emas, shuning uchun managerni haq/noxaq deb baholab bo'lmaydi. ` +
      `Ammo suhbat mazmunli edi (lid sifati "${an.leadQuality || "-"}"` +
      (ctxText ? `; ${ctxText}` : ``) + `) — bu lid qayta ishlanishi mumkin edi.`;
  } else if (matchConfidence === "phone") {
    conclusion =
      `"${reason}" sababi qo'ng'iroqqa telefon raqami bo'yicha bog'landi — bog'lanish aniq ` +
      `emasligi uchun baholab bo'lmadi.`;
  } else {
    conclusion =
      `"${reason}" sababini suhbat bilan aniq tasdiqlab yoki rad etib bo'lmadi` +
      (ctxText ? ` (${ctxText})` : ``) + `.`;
  }
}

return { reason, reasonSource, status, verdictLabel, conclusion, matchConfidence };
```
> ⚠️ `conversationSubstance` allaqachon `realConversation`/`emptyCall`/`strongConversation`
> qaytaradi — qoldir. Faqat yuqoridagi gating + label + conclusion o'zgaradi.

---

## 2. BACKEND controllerlar
- `audio.controller.ts` getAll asosiy `findMany` `analysis.select` (~312-317) — `followupPhrase: true,
  lossPoints: true` **qo'sh** (candidate select `rejectionAnalysisSelect` ishlatadi — 1b avtomatik qamraydi).
- `audit.controller.ts` `getLostVerdicts` — tally `info.status` bo'yicha (o'zgarishsiz ishlaydi).
  breakdown label: `right`→"Manager haq", `wrong`→"Manager noxaq", `unclear`→"Aniqlab bo'lmadi".
- `reasonSource` allaqachon `attachLeadCloseReasons` orqali audio obyektiga keladi — controllerda
  qo'shimcha o'zgarish shart emas (getRejectionInfo audio'dan o'qiydi).

## 3. FRONTEND
- `frontend/src/pages/audio/AudioDetailPage.tsx` `verdictStyle` (~312-317) label matnlari:
  `wrong`→"Manager noxaq", `right`→"Manager haq", `unclear`→"Aniqlab bo'lmadi" (ranglar qoladi).
  Karta allaqachon `conclusion`ni ko'rsatadi (badge + CRM sababi + xulosa) — struktura o'zgarmaydi.
- `frontend/src/pages/audio/AudioFilesPage.tsx` — badge `verdictLabel` matnini oladi (agar qattiq
  yozilган bo'lsa yangi label'ga moslashtir).
- `frontend/src/types/index.ts` `RejectionInfo` — `reasonSource?: "deal" | "lead"` qo'sh.
- `frontend/src/pages/audit/components/LostVerdictPie.tsx` — legend label backend breakdown bilan
  keladi (Manager haq / Manager noxaq / Aniqlab bo'lmadi).

## 4. NIMA QILMASLIK
- ❌ Vertex/LLM/yangi analiz. ❌ Schema migration. ❌ `judgeSkipped`/`judge-override`ga tegmaslik.
- ❌ `conversationSubstance` formulalarini o'zgartirmaslik (faqat ishlatilishi o'zgaradi).

## 5. Tekshirish (lokal DB — `postgresql://grafeas:grafeaslocal2026@localhost:5432/rozgovor_local`)
Prisma client: `backend/node_modules/@prisma/client`. `backend/`dan `DATABASE_URL=... node <probe.cjs>`
bilan `getRejectionInfo`ni 522 tahlil ustida ishga tushir (scratchpad'da `db-verdict-probe.cjs`
namunasi bor — moslashtir). Kutilgan natija:
1. **"Manager noxaq" deyarli 0** (faqat deal-close mismatch — lokalda closeReasonName=5) — 74.8%dan tushadi.
2. Intake teglar (`reasonSource="lead"`) + real suhbat → **"Aniqlab bo'lmadi"**, va har birining
   `conclusion` matni **BIR-BIRIDAN FARQ QILADI** (followupPhrase/lossPoints har audioga xos).
   Bir nechta namunani ko'z bilan tekshir — shablon bir xil bo'lmasin.
3. Build: `cd backend && npx tsc --noEmit` + `cd frontend && npm run build` — xatosiz.
4. E2E: `GET /api/audio?rejectionReason=all` → verdictLabel "Manager haq/noxaq/Aniqlab bo'lmadi";
   `GET /api/audio/:id` detail `conclusion` jonli; audit `lost-verdicts` breakdown yangi label.

## 6. Tegiladigan fayllar
| Fayl | O'zgarish |
|------|-----------|
| `backend/src/utils/rejection-info.ts` | reasonSource; select+2; gating (deal-only wrong); label "Manager..."; jonli conclusion |
| `backend/src/controllers/audio.controller.ts` | findMany select +followupPhrase,lossPoints |
| `backend/src/controllers/audit.controller.ts` | breakdown label matnlari |
| `frontend/src/pages/audio/AudioDetailPage.tsx` | verdictStyle label matnlari |
| `frontend/src/pages/audio/AudioFilesPage.tsx` | badge label |
| `frontend/src/types/index.ts` | RejectionInfo.reasonSource |
| `frontend/src/pages/audit/components/LostVerdictPie.tsx` | legend label |

**Maqsad:** (1) "Manager haq/noxaq" label; (2) har audioga xos jonli xulosa (mavjud analizdan);
(3) "noxaq" faqat real deal-close mismatchда — intake JUNK teglar ayblov emas, "Aniqlab bo'lmadi".
