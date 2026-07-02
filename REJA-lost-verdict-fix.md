# TASK: "Yo'qotilgan lid — manager haq/nohaq" verdikt mantig'ini to'g'rilash

> Loyiha: `D:\Projects\Work - AsosIt\SalesAI_Rozgovor\rozgovor` (SalesAI, Bitrix24).
> Bu spec o'zicha tushunarli — oldingi suhbatga murojaat shart emas.
> **QAT'IY CHEKLOV:** ❌ Vertex AI / Gemini / yangi LLM tahlil CHAQIRILMAYDI. ❌ Yangi analiz
> generatsiyasi YO'Q. ✅ Faqat **allaqachon mavjud** `Analysis` + `AudioFile` maydonlaridan
> foydalaniladi. Verdikt — kod ichidagi heuristika (deterministik), model chaqiruvi emas.

## ✅ Tasdiqlangan qarorlar (user, 2026-07-02)
1. **Qat'iylik = KONSERVATIV.** "nohaq" faqat kuchli, ishonchli mis-tag'da chiqadi
   (leadId-join + mijoz sezilarli gapirgan + real e'tiroz/issiq lid/≥2 daqiqa). Chegaraviy,
   shubhali, telefon-join holatlar → **"Aniqlab bo'lmadi"** (abstain). Maqsad: soxta "nohaq"
   yo'qolib, ko'rsatkich past va real bo'lishi.
2. **Teg lug'ati = lokal 4 ta yetarli** (prod tekshirilmaydi). Manba: `Noto'g'ri raqam`,
   `Chet el raqami`, `Ariza qoldirmagan`, `Bepul xohladi`. Tanilmagan teg → hech qachon "wrong"
   emas, faqat `right`(bo'sh qo'ng'iroq) yoki `unclear`.
3. **Detail karta = Badge + CRM teg + bitta xulosa** (quyidagi maket):
   ```
   [Teg noto'g'ri]      CRM sababi: Noto'g'ri raqam
   Manager "Noto'g'ri raqam" qo'ygan, lekin qo'ng'iroq 21 daqiqa davom etgan,
   lid "issiq", mijoz narx e'tirozi bildirgan — bu real yo'qotilgan lid, CRM sababi mos kelmaydi.
   ```

---

## 0. Muammo (nima buzuq va nega)

Funksiya: audio ro'yxatida 🚩 filtr + audio detalida "Yo'qotilgan lid tahlili" + audit
sahifasida "manager bahosi" pie. Hammasining yuragi: `backend/src/utils/rejection-info.ts`.

**Hozirgi mantiq** (`managerVerdictFor`): CRM yopish sababini AI tahlil matnidan olingan
**8 ta sotuv-e'tirozi kategoriyasi** (narx/vaqt/raqobatchi/qaror/ehtiyoj/ishonch/mos) bilan
solishtiradi. Kategoriya mos kelmasa → "nohaq".

**Real DB'da tekshirildi (522 tahlil, 258 "yo'qotilgan lid"):**
- Sabab qo'yilgan 111 lid ichida **95 = "nohaq" (86%)** — soxta yuqori.
- AI aniqlagan tip: **price=206 (80%)**, timing=51, trust=1 → AI-tip amalda **konstanta**
  ("to'lov/pul/narx" har suhbatda uchraydi, `price` ro'yxatda birinchi → doim ilinadi).
- "Aniq emas" **hech qachon chiqmaydi** (unclear=0) — abstain yo'q.
- CRM sabablari **sotuv e'tirozi EMAS**, hammasi operatsion/junk teg (pastga qarang).

**Ildiz sabab:** taqqoslash bazasi noto'g'ri. Operatsion teg 8 korzinaga tushmaydi →
avtomatik "nohaq". Bu keyword lotereyasi, real baho emas.

### Real CRM teg lug'ati (butun portalda faqat shu 4 ta — "Sifatsiz lid" enum)
`SalesLead.closeReasonName` va `Lead.rejectReasonName`dagi yagona qiymatlar:

| Teg | Ma'nosi (da'vo) | Transkriptdan tekshiriladigan savol |
|---|---|---|
| **Noto'g'ri raqam** | mijoz noto'g'ri/aloqasi yo'q | Mazmunli suhbat bo'lganmi? |
| **Chet el raqami** | chet el / til to'sig'i | To'liq o'zbekcha/ruscha suhbat bo'lganmi? |
| **Ariza qoldirmagan** | mijoz ariza bermagan | Mijoz mahsulot/kursni muhokama qilganmi? |
| **Bepul xohladi** | faqat bepul so'ragan | Mijoz to'lov/nasiya shartlarini muhokama qilganmi? |

**Kalit tushuncha:** bu 4 teg ham "bu lid haqiqiy/mazmunli emas edi" deb **da'vo qiladi**.
Demak verdikt savoli bitta: **"Transkriptda haqiqiy mazmunli suhbat bo'lganmi?"** Bo'lgan bo'lsa —
teg **noto'g'ri** (manager real lidni junk'ga tashlagan = mis-tag). Bo'lmagan bo'lsa — teg **to'g'ri**.

### Real DB dalili (mis-tag naqadar aniq ko'rinadi)
```
CRM="Noto'g'ri raqam" | status=done dur=1256s | clientSpeech=24% | leadQuality=issiq | obj=[Narx,Vaqt,Ishonch]
  → 21 daqiqalik ISSIQ lid suhbati. "Noto'g'ri raqam" — mutlaqo mos emas.
CRM="Bepul xohladi"   | status=done dur=797s  | clientSpeech=39% | leadQuality=iliq  | obj=[Narx x3,Vaqt,Ishonch]
  → mijoz Uzum Nasiya orqali TO'LOVni muhokama qilgan. "Bepul xohladi" — zid.
CRM="Chet el raqami"  | status=done dur=484s  | clientSpeech=24% | leadQuality=iliq
  → 18 yoshli o'zbek mijoz, rus tili kursi. Chet el emas.
```

---

## 1. Yangi verdikt modeli (asosiy qayta loyiha)

**8 ta e'tiroz-korzina taqqoslashini BUTUNLAY olib tashla.** Uning o'rniga:

**Ishlatiladigan signallar** (hammasi mavjud, Vertex'siz):
- `AudioFile.status` — `"done"` = STT+analiz to'liq o'tган (real suhbat bo'lган).
  `"too_short"` / `"no_conversation"` = suhbat yo'q. ← **eng kuchli diskriminator**.
- `AudioFile.duration` (sekund).
- `Analysis.clientSpeech` (0–100 %), `managerSpeech` (0–100 %) — mijoz qatnashuvi.
- `Analysis.leadQuality` (`"iliq"`/`"issiq"`/`"sovuq"`), `overallScore` (int).
- `Analysis.objections` — `[{type,count}]` (masalan `[{"type":"Narx","count":3}]`).
- `Analysis.requiresFollowup` (bool), `followupReason` (text), `summary` (text).
- ⚠️ `voiceOfCustomer` / `intentSignals` ko'pincha **bo'sh** — ularga TAYANMA.

**"Mazmunli suhbat" (realConversation) belgilari** — quyidagilardan hisobla:
```ts
const done          = audio.status === "done";
const longCall      = (audio.duration || 0) >= 90;          // ≥1.5 daqiqa
const clientEngaged = (an.clientSpeech || 0) >= 12;         // mijoz ≥12% gapirgan
const hasObjections = Array.isArray(an.objections) && an.objections.length > 0;
const warmLead      = ["iliq","issiq"].includes(String(an.leadQuality||"").toLowerCase())
                      || (an.overallScore || 0) >= 40;
const wantsFollowup = an.requiresFollowup === true;
const richSummary   = String(an.summary || "").length >= 120;

const realConversation =
  done && (clientEngaged || hasObjections || warmLead || longCall || wantsFollowup);

const emptyCall =
  ["no_conversation","too_short"].includes(String(audio.status)) ||
  (audio.duration || 0) < 30 ||
  (an.clientSpeech || 0) < 4;
```

**Teg-ga xos matn signali** (faqat "Bepul xohladi" uchun kerak, qolganlarga substance yetarli):
```ts
// "Bepul xohladi" — to'lov muhokamasi bo'lsa TEGGA ZID
const ctx = (String(an.summary||"") + " " + JSON.stringify(an.objections||[]) + " " +
             String(an.followupReason||"")).toLowerCase();
const paymentDiscussed = /nasiya|to'lov|tolov|to‘lov|uzum|alif|oy(lik)?|so'm|som|narx|chegirma|muddat/.test(ctx)
                         || (an.objections||[]).some(o => String(o.type).toLowerCase().includes("narx"));
const askedFree        = /bepul|tekin|pulsiz|majburlamang|shunchaki qiziq/.test(ctx);
```

**Lead ulanish ishonchi** (`attachLeadCloseReasons` leadId YOKI telefon-bo'yicha ulaydi;
telefon `contains` mos-joyi noto'g'ri lidni ulashi mumkin). `getRejectionInfo`ga ulanish
turini uzat: **exact leadId → `"id"` (ishonchli)**, faqat telefon → `"phone"` (past ishonch).
> `attachLeadCloseReasons` (rejection-info.ts:268-295) `audios.map(...)`da `dealLead`/`crmLead`ni
> qanday topganini biladi — `matchConfidence: audioLeadIds.some(...) ? "id" : "phone"` qo'shib,
> natijaga `matchConfidence` maydonini biriktir.

**Verdikt qarori (KONSERVATIV — qaror #1):** "nohaq" faqat ishonchli mis-tag'da. Buning uchun
`realConversation`dan kuchliroq `strongConversation` sharti kerak:
```ts
const strongConversation =
  audio.status === "done" &&
  (an.clientSpeech || 0) >= 15 &&                         // mijoz sezilarli gapirgan
  ( (Array.isArray(an.objections) && an.objections.length > 0)  // real e'tiroz
    || ["iliq","issiq"].includes(String(an.leadQuality||"").toLowerCase()) // issiq/iliq lid
    || (audio.duration || 0) >= 120 );                    // ≥2 daqiqa

// junk/operatsion teg (4 tadan biri yoki tanilmagan teg) uchun:
let status; // "right" | "wrong" | "unclear"
if (askedFree && !paymentDiscussed) {
  status = "right";                              // "Bepul xohladi" tasdiqlandi
} else if (emptyCall) {
  status = "right";                              // suhbat bo'lmagan → teg to'g'ri
} else if (strongConversation && matchConfidence === "id") {
  status = "wrong";                              // ishonchli mis-tag (KONSERVATIV: faqat shu holatda)
} else {
  status = "unclear";                            // chegaraviy / telefon-join / kuchsiz → abstain
}
// ⚠️ Tanilmagan teg (4 tadan tashqari) → "wrong" HECH QACHON; yuqoridagi mantiq baribir
//    faqat right/unclear beradi (bu teglar uchun ham xavfsiz).
```
> `realConversation` faqat `conclusion` matnini boyitish uchun ishlatiladi (issiq lid, e'tiroz
> tafsilotlari). Verdikt **status**i esa yuqoridagi `strongConversation`ga tayanadi.

**Natija shakli** (`getRejectionInfo` qaytaradi — YANGI, soddalashtirilgan):
```ts
return {
  reason,                 // CRM teg matni, masalan "Noto'g'ri raqam"
  status,                 // "wrong" | "right" | "unclear"
  verdictLabel,           // "Teg noto'g'ri" | "Teg to'g'ri" | "Aniqlab bo'lmadi"
  conclusion,             // ← UMUMIY XULOSA: bitta tushunarli matn (pastga qarang)
  matchConfidence,        // "id" | "phone" (ichki/tooltip uchun)
};
```
> Eski maydonlar (`type`, `label`, `aiReasonLabel`, `short`, `detail`, `evidence`,
> `managerVerdict{...}`) **olib tashlanadi**. Front to'liq shu yangi shaklga ko'chiriladi (F qism).

**`conclusion` (Umumiy xulosa) — konkret, real raqamlar bilan:**
```ts
const durMin = Math.round((audio.duration || 0) / 60);
const objTypes = (an.objections||[]).map(o=>o.type).filter(Boolean).join(", ");

if (status === "wrong") {
  conclusion =
    `Manager "${reason}" sababini qo'ygan, lekin qo'ng'iroq ${durMin} daqiqa davom etgan va `+
    `mijoz suhbatga faol qatnashgan (mijoz nutqi ${an.clientSpeech||0}%). `+
    (warmLead ? `Lid sifati "${an.leadQuality||''}". ` : ``)+
    (hasObjections ? `Mijoz e'tiroz bildirgan: ${objTypes}. ` : ``)+
    (reasonLower.includes("bepul") && paymentDiscussed
        ? `Mijoz to'lov/nasiya shartlarini muhokama qilgan — "bepul xohladi"ga zid. ` : ``)+
    `Bu — real yo'qotilgan lid, CRM sababi mos kelmaydi.`;
} else if (status === "right") {
  conclusion =
    `"${reason}" sababi to'g'ri qo'yilgan: qo'ng'iroqda mazmunli suhbat aniqlanmadi `+
    `(holat: ${audio.status}, ${audio.duration||0}s, mijoz nutqi ${an.clientSpeech||0}%).`;
} else { // unclear
  conclusion = (matchConfidence === "phone")
    ? `"${reason}" sababi shu qo'ng'iroqqa telefon raqami bo'yicha bog'landi — `+
      `bog'lanish aniq emasligi uchun haq/nohaq deb baholab bo'lmadi.`
    : `"${reason}" sababini transkript bilan aniq tasdiqlab yoki rad etib bo'lmadi `+
      `(suhbat signallari yetarli emas).`;
}
```

**`hasLostLeadSignal` — soddalashtir** (rejection-info.ts:95-103): faqat **sabab bor** lidlar
verdiktga kiradi (bare JUNK/statusId, sababsiz — 147 ta "unknown" shovqinni olib tashlaydi):
```ts
export const hasLostLeadSignal = (analysis, audio = {}) => {
  if (!analysis || audio?.isSale === true) return false;
  return !!(audio?.closeReasonName || audio?.leadRejectReasonName);
};
```

---

## 2. BACKEND o'zgarishlari

### B1 — `backend/src/utils/rejection-info.ts` (asosiy)
1. `managerVerdictFor`, `detectReasonType`, `verdictContextText`, `REJECTION_REASON_META`
   (e'tiroz-korzina mantig'i) — verdiktdan **olib tashlanadi** yoki ishlatilmaydi.
   > `REJECTION_REASON_META`ni o'chirsang, uni import qiladigan joy yo'qligini tekshir.
2. `hasLostLeadSignal` — 1-qismdagidek soddalashtir.
3. Yangi helper `conversationSubstance(analysis, audio)` — yuqoridagi belgilarni hisoblab qaytaradi.
4. `getRejectionInfo`ni 1-qismdagi yangi model bo'yicha qayta yoz — yangi natija shakli
   (`reason, status, verdictLabel, conclusion, matchConfidence`).
5. `attachLeadCloseReasons` (268-295) — har audio natijasiga `matchConfidence` (`"id"`/`"phone"`)
   qo'sh (leadId bo'yicha topilганmi yoki faqat telefon bo'yichami).
6. `rejectionAnalysisSelect` (32-43) — quyidagilarni **qo'sh**: `clientSpeech: true`,
   `managerSpeech: true`, `requiresFollowup: true`, `leadQuality: true` (bor), `overallScore` (bor).

### B2 — `backend/src/controllers/audio.controller.ts`
- `getAll` candidate select (280-286) — `status: true, duration: true` **qo'sh**
  (hozir yo'q; substance uchun kerak).
- `getAll` asosiy `findMany` `analysis.select` (312-318) — `clientSpeech, managerSpeech,
  requiresFollowup` **qo'sh** (substance getRejectionInfo uchun). `status`/`duration` — `include`
  ishlatilgani uchun AudioFile scalarlari avtomatik keladi, tekshir.
- `getAll` filtr sharti (291-295): `info.type === rejectionReason` mantig'ini **soddalashtir** —
  yangi modelda `type` yo'q. `rejectionReason` faqat `"all"`/off. Shart:
  `const info = getRejectionInfo(a.analysis, a); return !!info;`
- `getOne` (371-378) — o'zgarishsiz ishlaydi (getRejectionInfo yangi shaklni biriktiradi),
  faqat `getOne` audiosi `status`/`duration`/yangi analiz maydonlarini o'qishini tekshir
  (getOne to'liq audioFile + analysis o'qiydi — odатда bor, tasdiqla).

### B3 — `backend/src/controllers/audit.controller.ts` (`getLostVerdicts`, 290-343)
- candidate select (304-312) — `status: true, duration: true` **qo'sh**; `analysis` select
  `rejectionAnalysisSelect` dan foydalanadi (yangi maydonlar avtomatik keladi).
- Tally (321-329): `info.managerVerdict?.status` → **`info.status`** ga o'zgartir (yangi shakl).
  `unknown` endi chiqmaydi (sababsizlar getRejectionInfo'dan null qaytadi). breakdown label:
  `right`→"To'g'ri", `wrong`→"Noto'g'ri", `unclear`→"Aniqlab bo'lmadi".

---

## 3. FRONTEND o'zgarishlari

### F1 — `frontend/src/types/index.ts`
`RejectionInfo`ni yangi shaklga moslashtir; `ManagerVerdict` tipini olib tashla (yoki bo'sh qoldirma):
```ts
export interface RejectionInfo {
  reason: string;
  status: "right" | "wrong" | "unclear";
  verdictLabel: string;
  conclusion: string;
  matchConfidence?: "id" | "phone";
}
```

### F2 — `frontend/src/pages/audio/AudioDetailPage.tsx` (asosiy UX yaxshilanishi)
- `verdictStyle` (312-317) — 3 status uchun rang/label saqlansin:
  `wrong`→qizil "Teg noto'g'ri", `right`→yashil "Teg to'g'ri", `unclear`→sariq "Aniqlab bo'lmadi".
- `rejectionInfo` derivatsiyasi (366-374) — soddalashtir: `rejectionInfo?.conclusion`,
  `rejectionInfo?.status`, `rejectionInfo?.reason`.
- Karta (1048-1100) — **3 qutini 1 taga qisqartir**. Faqat:
  - Sarlavha: "Yo'qotilgan lid tahlili"
  - Bitta qatorli badge: `verdictLabel` (rang status bo'yicha) + o'ng tarafda kichik
    `CRM sababi: <b>{reason}</b>`.
  - Ostида **bitta matn** — `{conclusion}` (Umumiy xulosa). Boshqa quti/ro'yxat YO'Q.
  - `matchConfidence === "phone"` bo'lsa, matn ostida kichik kulrang eslatma:
    "⚠ Sabab telefon raqami bo'yicha bog'landi".
  > "Asoslar" ro'yxati, qizil qutidagi `short`, takroriy `managerVerdict.short` — **o'chiriladi**.

### F3 — `frontend/src/pages/audio/AudioFilesPage.tsx`
- Qatordagi verdict badge — yangi `status`/`verdictLabel`ga ko'chir (agar `managerVerdict.status`
  ishlatgan bo'lsa → `rejectionInfo.status`). Badge matni: `verdictLabel`, tooltip: `conclusion`.

### F4 — `frontend/src/pages/audit/components/LostVerdictPie.tsx` + `audit.service.ts`
- `LostVerdictStatus` va `VERDICT_COLOR` `right|wrong|unclear` — bor. Faqat label matnlarini
  backend breakdown bilan moslashtir ("To'g'ri"/"Noto'g'ri"/"Aniqlab bo'lmadi").

---

## 4. NIMA QILMASLIK
- ❌ Vertex / Gemini / yangi analiz chaqirmaslik. Faqat mavjud `Analysis`/`AudioFile` maydonlari.
- ❌ Prisma schema migration YO'Q (yangi ustun kerak emas).
- ❌ `judgeSkipped`/`judgeOverridden`/`judge-override` (⚖️ Sud) — **tegmaslik**, alohida feature.
- ❌ Sotuv/KPI/dashboard mantig'iga tegmaslik.
- ❌ Yangi CRM teg lug'atini o'ylab topmaslik — faqat mavjud 4 teg + "tanilmagan teg → substance".

---

## 5. Tekshirish (real DB, Vertex'siz)

1. **Build:** `cd backend && npx tsc --noEmit` xatosiz; `cd frontend && npm run build` xatosiz.
2. **DB probe** (namuna skript pastda) — 522 tahlil ustida yangi `getRejectionInfo`ni ishga tushir:
   - **"wrong" ulushi oldingi 86%dan sezilarli past** bo'lsin (konservativ qaror). Chegaraviy
     holatlar **"unclear"ga** o'tadi — "unclear" salmoqli ulush olishi kutiladi.
   - Har **"wrong"** verdiktda `conclusion` — konkret raqam (daqiqa, %, e'tiroz) bilan bo'lsin,
     "narx mos emas" kabi generik matn **bo'lmasin**.
   - Bare-JUNK sababsiz lidlar (147 ta) endi verdiktga kirmasin (null qaytsin).
   - Telefon-join lidlar "wrong" emas, "unclear" bo'lsin; "wrong" faqat leadId-join + kuchli suhbat.
3. **Spot-check** (real misollar shu holatga kelishi kerak):
   - `"Noto'g'ri raqam"` + 1256s/issiq → **wrong**, conclusion "21 daqiqa... issiq lid...".
   - `"Bepul xohladi"` + Uzum Nasiya to'lovi → **wrong**, conclusion "to'lov muhokama qilingan...".
   - Haqiqiy `no_conversation`/`too_short` + teg → **right**.
4. **UI:** detalda faqat **1 ta Umumiy xulosa matni** + badge ko'rinsin; pie'da 3 bo'lak
   (To'g'ri/Noto'g'ri/Aniqlab bo'lmadi), "unknown" yo'q.

### Namuna probe skript (lokal DB — `postgresql://grafeas:grafeaslocal2026@localhost:5432/rozgovor_local`)
`backend/`dan ishga tushir: `DATABASE_URL=... node <script>`. `attachLeadCloseReasons` +
`getRejectionInfo`ni import qilib (yoki ts-node bilan), yo'qotilgan lidlar ustида
`status` taqsimotini (right/wrong/unclear) va har biriga `conclusion`ni chop et; wrong ulushi
oldingi 86%dan realroq tushishini va conclusion konkretligini ko'z bilan tasdiqla.
> Eslatma: lokal DB'da `SalesLead.closeReasonName`=5, lekin `Lead.rejectReasonName`=6952 — sabab
> asosan `Lead`dan keladi (`leadRejectReasonName || closeReasonName` ustuvorligi to'g'ri).

---

## 6. Tegiladigan fayllar (xulosa)

| # | Fayl | O'zgarish |
|---|------|-----------|
| B1 | `backend/src/utils/rejection-info.ts` | verdikt modelini qayta yoz (substance-based); `hasLostLeadSignal`, `getRejectionInfo`, `attachLeadCloseReasons(matchConfidence)`, `rejectionAnalysisSelect` |
| B2 | `backend/src/controllers/audio.controller.ts` | candidate/findMany select'ga `status,duration,clientSpeech,managerSpeech,requiresFollowup`; filtr `type` shartini soddalashtir |
| B3 | `backend/src/controllers/audit.controller.ts` | select'ga `status,duration`; tally `info.status`; label'lar |
| F1 | `frontend/src/types/index.ts` | `RejectionInfo` yangi shakl |
| F2 | `frontend/src/pages/audio/AudioDetailPage.tsx` | 3 quti → 1 "Umumiy xulosa" matn + badge |
| F3 | `frontend/src/pages/audio/AudioFilesPage.tsx` | badge → yangi `status`/`verdictLabel` |
| F4 | `frontend/src/pages/audit/components/LostVerdictPie.tsx` + `audit.service.ts` | label matnlar |

**Maqsad:** verdikt o'z mantig'i bo'yicha to'g'ri ishlasin — CRM tegini **transkript reallиги**
bilan solishtirib (e'tiroz-korzina emas), ishonch past bo'lsa abstain qilib, va detalda **bitta
konkret Umumiy xulosa** ko'rsatib. Soxta "nohaq" yo'qoladi; qolgan "nohaq"lar — dalilli, real mis-tag.
