# TASK (implementatsiya agenti uchun): "Yo'qotilgan lidlar" 🚩 filtri + manager haq/noxaq verdict

> Loyiha: `D:\Projects\Work - AsosIt\SalesAI_Rozgovor\rozgovor` (SalesAI, Bitrix24).
> Aktiv portal: `https://rozgovoruz.bitrix24.kz/rest/527/8cmow72uy63s4ewg`.
> Manba (ko'chiriladigan feature): `D:\Projects\Work - AsosIt\SalesAI_InterWork` (xuddi shu kodbaza forki).
> Bu spec o'zicha tushunarli — oldingi suhbatga murojaat shart emas.

---

## 0. Kontekst (nima va nega)

Audio bo'limiga InterWorkdagi **ikki qismli bitta feature** ko'chiriladi:

1. **🚩 "Yo'qotilgan lidlar" filtri** (`rejectionReason`) — audio ro'yxatida bayroqcha tugmasi.
   Yoniq bo'lsa faqat **rad etilgan lidlar** qo'ng'iroqlari ko'rsatiladi.
2. **Manager haq/noxaq verdict** — audio tahlili detailida. CRM yopish sababini
   (`SalesLead.closeReasonName`) AI suhbat tahlili (e'tirozlar, yo'qotish nuqtalari,
   summary, voiceOfCustomer) bilan solishtirib, manager **haq (Tasdiqlandi)** yoki
   **noxaq (Mos emas)** ekanini aniqlaydi. Detail + list badge'da ko'rinadi.

### Manba kod (InterWork)
- **Backend:** `backend/dist/controllers/audio.controller.js` — ⚠️ InterWork backend `.ts` manbasi
  **yo'q**, faqat kompilyatsiya qilingan `dist`. Logikani shu JS'dan Rozgovor `.ts`ga ko'chiring.
- **Frontend detail:** `frontend/src/pages/audio/AudioDetailPage.tsx`
- **Frontend list:** `frontend/src/pages/audio/AudioFilesPage.tsx`

### ⚠️ Bu feature `judgeSkipped` (⚖️ Sud) BILAN BOG'LIQ EMAS
Rozgovorda allaqachon `Analysis.judgeSkipped` / `judgeOverridden` ("⚖️ Sud" badge +
`PATCH /api/audio/:id/judge-override`) bor — bu **butunlay boshqa** mexanizm (qo'ng'iroqni
menejer reytingidan chiqarish). Unga **TEGMANG**. Bu yangi feature mustaqil.

### Asosiy qaror (tasdiqlangan)
- **"Lost" ta'rifi (Bitrix):** lid `SalesLead.closeReasonName` belgilangan bo'lsa = yo'qotilgan.
  `semanticId="F"` filtri **ishlatilmaydi** (bu portalda "Sifatsiz lid" sababi NEW/P bosqich
  deal'larga qo'yiladi, F'ga emas — `REJA-rad-etish-sabablari.md`ga qarang). Bu InterWorkdagi
  AmoCRM `isClosedRealizedLead` ("закрыто реализовано") mantig'ini **almashtiradi**.
- **Ma'lumot:** yangi DB ustun **yo'q**. `closeReasonName` allaqachon `SalesLead`'da bor va
  rad-etish reja orqali to'ldirilgan. Faqat **so'rov vaqtida** SalesLead → AudioFile join qilinadi.
- **i18n:** Rozgovor frontend `t()` **ishlatmaydi** — barcha matn **hardcoded o'zbekcha**
  (mavjud AudioDetailPage uslubidagidek). InterWorkdagi `t("...")` chaqiruvlarini o'zbekcha
  literal bilan almashtiring (verdict label'lari pastda berilgan).

---

## 1. BACKEND o'zgarishlari

**Fayl:** `backend/src/controllers/audio.controller.ts`

### EDIT B1 — Helper funksiyalar va konstantalar qo'shish (fayl yuqorisiga, `getAll`dan oldin)

InterWork `dist/controllers/audio.controller.js`'dan quyidagilarni TS'ga ko'chiring
(qator raqamlari InterWork dist'da):

| Funksiya / const | InterWork dist qator | Holat |
|---|---|---|
| `REJECTION_REASON_META` | 134-143 | **AYNAN** ko'chiriladi |
| `LOST_TEXT_KEYWORDS` | 145-151 | **AYNAN** (matn signali fallback uchun) |
| `textOf` | 152-163 | **AYNAN** |
| `verdictContextText` | 200-215 | **AYNAN** |
| `detectReasonType` | 216-222 | **AYNAN** |
| `managerVerdictFor` | 223-238 | **AYNAN** (haq/noxaq yuragi) |
| `compactText` | 239-241 | **AYNAN** |
| `getRejectionInfo` | 345-391 | **AYNAN** |
| `phoneKey` | 392-395 | **AYNAN** |
| `chunkArray` | 396-401 | **AYNAN** |
| `attachLeadCloseReasons` | 402-469 | **AYNAN** (pastdagi B1a eslatmasi bilan) |
| `hasLostLeadSignal` | 328-344 | **ALMASHTIRILADI** — B1b'ga qarang |
| `isClosedRealizedLead`, `LOST_STATUS_KEYWORDS`, `CLOSED_REALIZED_STATUS` | 144, 323-327 | **KO'CHIRILMAYDI** (AmoCRM'ga xos, kerak emas) |

> `rejectionContextParts` / `lostTextFor` (176-195) — `hasLostLeadSignal` matn-fallback'ida
> ishlatiladi; B1b'dagi soddalashtirilgan variantda kerak bo'lmasa, ko'chirmasa ham bo'ladi.

**B1a — `attachLeadCloseReasons` Rozgovorga moslik:** funksiya AYNAN mos (Rozgovor `SalesLead`'da
`leadId, originalLeadId, closeReasonName, statusName, semanticId, contactPhone, leadTags,
closedAt, isSale, pipelineName, pipelineId` — hammasi bor; `AudioFile`'da `leadId, phoneNumber` bor).
⚠️ **FAQAT bitta o'zgarish:** `closedAtRange` parametrini **ishlatmang**. InterWork `closedAt`
bo'yicha lidlarni cheklaydi, lekin bu portalda sabab NEW/P deal'larga qo'yiladi va `closedAt`
ishonchsiz (reja sanasi bo'lib aldashi mumkin). Shuning uchun:
- `attachLeadCloseReasons`'da `options.closedAtRange` blokini (dist 426-427) **olib tashlang**
  yoki hech qachon uzatmang.
- Davr filtri AudioFile'ning o'z `callDate`/`createdAt` bo'yicha (mavjud `getAll` mantig'i) ishlaydi.

**B1b — `hasLostLeadSignal` (Bitrix variant, soddalashtirilgan):**
```ts
// "Lost" = Bitrix CRM yopish sababi belgilangan (A usul, semanticId filtrisiz).
// InterWork AmoCRM "закрыто реализовано" mantig'i bu portalga mos emas — closeReasonName'ga tayanamiz.
const hasLostLeadSignal = (analysis: any, audio: any = {}): boolean => {
  if (!analysis || audio?.isSale === true) return false;
  return !!audio?.closeReasonName;
};
```
> Natija: `getRejectionInfo` faqat `closeReasonName` mavjud lidlarda non-null qaytaradi.
> `managerVerdictFor` esa shu `closeReasonName`ni AI konteksti bilan solishtirib haq/noxaq beradi.

### EDIT B2 — `getAll`: rejection filtr branchi + har bir qatorga `rejectionInfo` biriktirish

Rozgovor `getAll` (`audio.controller.ts:~85-290`). InterWork dist `getAll`dagi (648-731) mantiqni
moslab qo'shing:

**B2a.** Query'dan param o'qish (mavjud `const { ... } = req.query;` yonida):
```ts
const rejectionReason = req.query.rejectionReason as string | undefined;
```

**B2b.** `findMany`/`count`'dan **oldin** rejection branchi (InterWork 645-676 asosida, AMMO
`isClosedRealizedLead` filtri **olib tashlangan**):
```ts
let forcedPageIds: string[] | null = null;
let forcedTotal: number | null = null;

if (rejectionReason) {
  const candidates = await prisma.audioFile.findMany({
    where,
    select: {
      id: true, leadId: true, phoneNumber: true, isSale: true,
      statusName: true, pipelineName: true, createdAt: true,
      analysis: { select: rejectionAnalysisSelect },
    },
  });
  const withReasons = await attachLeadCloseReasons(req.companyId!, candidates);
  const rejectionPipeline = req.query.pipeline ? String(req.query.pipeline).trim() : "";
  const rejectedIds = withReasons
    .filter((a: any) => !rejectionPipeline || a.pipelineName === rejectionPipeline)
    .filter((a: any) => {
      const info = getRejectionInfo(a.analysis, a);
      if (!info) return false;
      return rejectionReason === "all" || info.type === rejectionReason;
    })
    .sort((a: any, b: any) => {
      const cd = new Date(b.leadClosedAt || 0).getTime() - new Date(a.leadClosedAt || 0).getTime();
      if (cd !== 0) return cd;
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    })
    .map((a: any) => a.id);
  forcedTotal = rejectedIds.length;
  forcedPageIds = rejectedIds.slice(skip, skip + limit);
  where.id = { in: forcedPageIds };
}
```
Va `rejectionAnalysisSelect` const'ini helperlar yoniga qo'shing (InterWork 164-175 AYNAN).

**B2c.** Mavjud `findMany` include'idagi `analysis.select`'ni kengaytiring (rejectionInfo hisoblash
uchun kerakli maydonlar) — InterWork 701-708'dagidek qo'shing:
`summary, objections, lossPoints, followupReason, followupPhrase, voiceOfCustomer, judgeReason`
(mavjud `overallScore, leadQuality, leadScore, errors, criteria` saqlanadi).
Va `skip`/`take`'ni `forcedPageIds ? undefined : skip|limit` qiling, `count`'ni
`forcedTotal != null ? forcedTotal : count` qiling (InterWork 712-715).

**B2d.** Javobdan **oldin** har bir qatorga lead reason + rejectionInfo biriktirish (InterWork 717-724):
```ts
const audioFilesWithReasons = await attachLeadCloseReasons(req.companyId!, audioFiles);
const orderedIds = forcedPageIds
  ? new Map(forcedPageIds.map((id, i) => [id, i]))
  : null;
const enriched = audioFilesWithReasons
  .map((audio: any) => ({
    ...audio,
    analysis: audio.analysis
      ? { ...audio.analysis, rejectionInfo: getRejectionInfo(audio.analysis, audio) }
      : audio.analysis,
  }))
  .sort((a: any, b: any) =>
    orderedIds ? (orderedIds.get(a.id) ?? 0) - (orderedIds.get(b.id) ?? 0) : 0
  );

success(res, { data: enriched, total, page, limit, totalPages: Math.ceil(total / limit) });
```
> ⚠️ Mavjud `category` ("sotuv"/"qayta") leadIdFilter mantig'i (`where.id = {in: ...}`) bilan
> `rejectionReason`ning `where.id`si **to'qnashishi** mumkin. Ikkalasi bir vaqtda kelganda
> rejection branchi `where`'ni (category allaqachon qo'ygan `where.id` ham) inobatga olib
> candidate'larni oladi — tartibni shunday saqlang: avval category leadIdFilter, keyin rejection.

### EDIT B3 — `getOne`: detailga `rejectionInfo` biriktirish

Rozgovor `getOne` (`audio.controller.ts:292-314`) hozir `success(res, audioFile)` qiladi.
InterWork 753-760'dagidek almashtiring:
```ts
const [audioWithReason] = await attachLeadCloseReasons(req.companyId!, [audioFile]);
const enriched = {
  ...audioWithReason,
  analysis: (audioWithReason as any).analysis
    ? { ...(audioWithReason as any).analysis,
        rejectionInfo: getRejectionInfo((audioWithReason as any).analysis, audioWithReason) }
    : (audioWithReason as any).analysis,
};
success(res, enriched);
```

> **Route o'zgarishi YO'Q.** `rejectionReason` mavjud `GET /api/audio` query parami; `getOne` ham bor.

---

## 2. FRONTEND o'zgarishlari

### EDIT F1 — Types (`frontend/src/types/index.ts`)

`Analysis` interfeysiga qo'shing:
```ts
rejectionInfo?: RejectionInfo | null;
```
Va yangi tip (InterWork tuzilishiga mos):
```ts
export interface ManagerVerdict {
  status: "right" | "wrong" | "unclear" | "unknown";
  label: string;
  short: string;
  detail: string;
}
export interface RejectionInfo {
  type: string;          // price|timing|competitor|authority|need|trust|fit|other
  label: string;
  short: string;
  detail: string;
  managerReason?: string | null;
  managerVerdict?: ManagerVerdict;
  evidence?: string[];
}
```

### EDIT F2 — Service (`frontend/src/services/audio.service.ts`)

`getAll(filters)` filtr tipiga `rejectionReason?: string` qo'shing va query paramga uzating
(boshqa paramlar yonida): `...(filters.rejectionReason ? { rejectionReason: filters.rejectionReason } : {})`.
QueryKey'ga ham `rejectionReason` kiriting (cache invalidatsiya uchun).

### EDIT F3 — Audio ro'yxati (`frontend/src/pages/audio/AudioFilesPage.tsx`)

⚠️ **Rozgovor list = JADVAL (AUDIO_COLUMNS), InterWork = kartochka.** Toolbar tugmasi toza
ko'chadi; qator ichidagi ko'rinish jadvalga moslanadi.

**F3a — State + query:**
```ts
const [rejectionReason, setRejectionReason] = useState("");
```
`useQuery` queryKey va `audioService.getAll({...})` chaqiruviga `rejectionReason` qo'shing.
(Saqlanadigan filtrlar bo'lsa — sessionStorage state'iga ham qo'shing.)

**F3b — 🚩 Flag toggle tugmasi** (toolbarda, masalan ustun-sozlash dropdown yoki filter tugmasi yonida).
InterWork `AudioFilesPage.tsx:1320-1340` asosida, o'zbekcha tooltip bilan:
```tsx
<button
  onClick={() => {
    setRejectionReason((prev) => (prev ? "" : "all"));
    setStatus("done");
    setPage(1);
  }}
  className="relative inline-flex items-center gap-1.5 px-2.5 py-2 border rounded-lg transition-colors"
  style={{
    color: rejectionReason ? "#ef4444" : "var(--text-secondary)",
    borderColor: rejectionReason ? "rgba(239,68,68,0.6)" : "var(--color-border)",
    backgroundColor: rejectionReason ? "rgba(239,68,68,0.1)" : "transparent",
    boxShadow: rejectionReason ? "0 0 0 3px rgba(239,68,68,0.12)" : "none",
  }}
  title={rejectionReason ? "Yo'qotilgan lidlar: yoniq" : "Yo'qotilgan lidlarni ko'rsatish"}
>
  <Flag size={16} fill={rejectionReason ? "currentColor" : "none"} />
  {rejectionReason && <span className="text-xs font-semibold">Yo'qotilgan</span>}
</button>
```
(`Flag` ikonkasi `lucide-react`'dan import qilinadi.)

**F3c — Qatorda haq/noxaq badge** (user so'rovi: "list badge"). `verdictStyle` helperini
(pastdagi F4a) shu faylga ham qo'shing. `rejectionReason` yoniq VA `audio.analysis?.rejectionInfo`
mavjud bo'lganda, mos jadval katakchasida (masalan "Lid sifati"/"Umumiy ball" yonida) badge:
```tsx
{rejectionReason && audio.analysis?.rejectionInfo?.managerVerdict && (() => {
  const v = verdictStyle(audio.analysis.rejectionInfo.managerVerdict.status);
  return (
    <span
      className="text-[10px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap"
      style={{ color: v.color, backgroundColor: v.bg, border: `1px solid ${v.border}` }}
      title={audio.analysis.rejectionInfo.short || ""}
    >
      {v.label}
    </span>
  );
})()}
```
> Aniq katakcha joylashuvi agent ixtiyorida (jadval tuzilishiga moslang). Asosiy talab: verdict
> badge ro'yxatda ko'rinsin.

### EDIT F4 — Audio detail (`frontend/src/pages/audio/AudioDetailPage.tsx`)

**F4a — `verdictStyle` helper** (fayl yuqorisiga, hardcoded o'zbekcha — InterWork 100-105 AYNAN):
```ts
const verdictStyle = (status?: string) => {
  if (status === "right")  return { label: "Manager haq",   color: "#22c55e", bg: "rgba(34,197,94,0.12)",  border: "rgba(34,197,94,0.28)" };
  if (status === "wrong")  return { label: "Manager nohaq", color: "#ef4444", bg: "rgba(239,68,68,0.12)",  border: "rgba(239,68,68,0.28)" };
  if (status === "unclear")return { label: "Aniq emas",     color: "#f59e0b", bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.28)" };
  return { label: "Sabab yo'q", color: "#94a3b8", bg: "rgba(148,163,184,0.1)", border: "rgba(148,163,184,0.22)" };
};
```

**F4b — `rejectionInfo`ni serverdan o'qish** (komponent ichida, render'dan oldin):
```ts
const rejectionInfo = (audio?.analysis as any)?.rejectionInfo || null;
const rejectionLabel =
  rejectionInfo?.managerVerdict?.status === "right" && rejectionInfo?.managerReason
    ? rejectionInfo.managerReason
    : rejectionInfo?.label;
const rejectionShort =
  rejectionInfo?.short || rejectionInfo?.detail || rejectionInfo?.managerVerdict?.short || rejectionInfo?.managerReason;
const rejectionEvidence: string[] = Array.isArray(rejectionInfo?.evidence) ? rejectionInfo.evidence : [];
```
> Server `getRejectionInfo`ni biriktiradi (B3), shuning uchun client'da qayta hisoblash shart emas.
> (InterWork'dagi `getLocalRejectionInfo` fallback'i ixtiyoriy — default rejaga kirmaydi.)

**F4c — Rejection card bloki** (analiz natijalari orasiga, mos joyga). InterWork
`AudioDetailPage.tsx:1353-1400` asosida, `t(...)` → o'zbekcha literal:
- Karta sarlavhasi: **"Yo'qotilgan lid tahlili"**
- Qizil quti: 🚩 `{rejectionLabel}` + `{rejectionShort}`
- Verdict quti: sarlavha **"CRM tekshiruvi"**, o'ng tarafda badge
  (`right`→"Tasdiqlandi", `wrong`→"Mos emas", aks holda `managerVerdict.label`),
  `managerReason` bo'lsa **"CRM sababi: <b>{reason}</b>"**, pastida `managerVerdict.short`.
- "Asoslar" quti: `rejectionEvidence` ro'yxati (bor bo'lsa).
- Faqat `{rejectionInfo && ( ... )}` shartida render qiling.

```tsx
{rejectionInfo && (
  <div className="rounded-xl border p-4 space-y-4" style={{ borderColor: "var(--color-border)" }}>
    <div className="text-sm font-semibold">Yo'qotilgan lid tahlili</div>

    <div className="rounded-xl p-4" style={{ backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.22)" }}>
      <div className="flex items-center gap-2 mb-2" style={{ color: "#ef4444" }}>
        <Flag size={18} />
        <span className="text-sm font-bold">{rejectionLabel}</span>
      </div>
      <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{rejectionShort}</p>
    </div>

    {rejectionInfo.managerVerdict && (
      <div className="rounded-xl p-4" style={{ backgroundColor: verdictStyle(rejectionInfo.managerVerdict.status).bg, border: `1px solid ${verdictStyle(rejectionInfo.managerVerdict.status).border}` }}>
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>CRM tekshiruvi</div>
          <span className="text-xs font-bold px-2 py-1 rounded-full" style={{ color: verdictStyle(rejectionInfo.managerVerdict.status).color, backgroundColor: "rgba(0,0,0,0.12)" }}>
            {rejectionInfo.managerVerdict.status === "right" ? "Tasdiqlandi"
              : rejectionInfo.managerVerdict.status === "wrong" ? "Mos emas"
              : (rejectionInfo.managerVerdict.label || "Aniq emas")}
          </span>
        </div>
        {rejectionInfo.managerReason && (
          <p className="text-sm mb-2 whitespace-pre-wrap break-words">CRM sababi: <b>{rejectionInfo.managerReason}</b></p>
        )}
        <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{rejectionInfo.managerVerdict.short}</p>
      </div>
    )}

    {rejectionEvidence.length > 0 && (
      <div className="rounded-xl p-4" style={{ backgroundColor: "rgba(156,163,175,0.06)", border: "1px solid rgba(156,163,175,0.18)" }}>
        <div className="text-xs font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>Asoslar</div>
        <ul className="space-y-2 text-sm">
          {rejectionEvidence.map((line, i) => (
            <li key={i} className="flex gap-2"><span style={{ color: "var(--text-secondary)" }}>-</span><span className="break-words min-w-0">{line}</span></li>
          ))}
        </ul>
      </div>
    )}
  </div>
)}
```

---

## 3. NIMA QILMASLIK kerak

- `judgeSkipped` / `judgeOverridden` / `judge-override` route'iga **tegmang** — alohida feature.
- Prisma schema'ga **yangi ustun qo'shmang** — `closeReasonName` allaqachon `SalesLead`'da bor,
  query-time join ishlatiladi. Migration **shart emas**.
- InterWork `isClosedRealizedLead` / `CLOSED_REALIZED_STATUS` ("закрыто реализовано") ni
  **ko'chirmang** — AmoCRM'ga xos, Bitrixda kerak emas (B1b o'rniga ishlatiladi).
- `attachLeadCloseReasons`'da `closedAtRange` bo'yicha SalesLead'ni cheklamang (B1a).
- `semanticId="F"` bo'yicha "lost" aniqlamang — bu portalda sabab F'ga qo'yilmaydi.
- Frontendda `t()` / i18n qo'shmang — hardcoded o'zbekcha.
- Sotuv/KPI yoki sales.controller mantig'iga tegmang.

---

## 4. Tekshirish / qabul mezoni

1. **Build:** `cd backend && npm run build` (yoki `tsc --noEmit`) — xatosiz. `cd frontend && npm run build` — xatosiz.
2. **API (filtrsiz):** `GET /api/audio` — har bir `analysis`'da `rejectionInfo` maydoni bor
   (sabab yo'q lidlarda `null`).
3. **API (filtr):** `GET /api/audio?rejectionReason=all` — faqat `closeReasonName` belgilangan
   lidlar qaytadi; `total` shularning soni; har birida `analysis.rejectionInfo.managerVerdict.status`
   (`right`/`wrong`/`unclear`) bor.
4. **API (detail):** `GET /api/audio/:id` — yo'qotilgan lid bo'lsa `analysis.rejectionInfo` to'liq
   (managerReason, managerVerdict, evidence) keladi.
5. **UI list:** `/audio` → 🚩 tugma bosilganda ro'yxat faqat yo'qotilgan lidlarga qisqaradi,
   qatorlarda "Manager haq"/"Manager nohaq" badge ko'rinadi.
6. **UI detail:** yo'qotilgan lid audiosini ochganda "Yo'qotilgan lid tahlili" karta — CRM sababi,
   "CRM tekshiruvi" verdict (Tasdiqlandi/Mos emas), Asoslar ko'rinadi.

✅ **Qabul:** rad-etish reja bajarilgan (closeReasonName to'ldirilgan) bo'lsa, 🚩 filtr ~5+ lid
chiqaradi va har biriga haq/noxaq verdict beradi. Sabab kam bo'lsa natija kam — bu kod muammosi
emas, ma'lumot kamligi (`REJA-rad-etish-sabablari.md` ogohlantirishiga qarang).

---

## 5. Tegiladigan fayllar (xulosa)

| # | Fayl | O'zgarish |
|---|------|-----------|
| B1 | `backend/src/controllers/audio.controller.ts` | helperlar (REJECTION_REASON_META, managerVerdictFor, getRejectionInfo, attachLeadCloseReasons, ...) — InterWork dist'dan ko'chirish; `hasLostLeadSignal` Bitrix variant |
| B2 | `backend/src/controllers/audio.controller.ts` `getAll` | rejection filtr branchi + har qatorga `rejectionInfo` |
| B3 | `backend/src/controllers/audio.controller.ts` `getOne` | detailga `rejectionInfo` |
| F1 | `frontend/src/types/index.ts` | `RejectionInfo`, `ManagerVerdict` tiplari + `Analysis.rejectionInfo` |
| F2 | `frontend/src/services/audio.service.ts` | `getAll` filtriga `rejectionReason` |
| F3 | `frontend/src/pages/audio/AudioFilesPage.tsx` | 🚩 Flag toggle + qatorda verdict badge + query |
| F4 | `frontend/src/pages/audio/AudioDetailPage.tsx` | `verdictStyle` + "Yo'qotilgan lid tahlili" karta |

**Manba (verbatim ko'chirish uchun):**
- Backend: `D:\Projects\Work - AsosIt\SalesAI_InterWork\backend\dist\controllers\audio.controller.js`
  (helperlar 134-469, `getAll` 470-738, `getOne` 739-767)
- Frontend detail: `...\SalesAI_InterWork\frontend\src\pages\audio\AudioDetailPage.tsx` (100-178, 1353-1400)
- Frontend list: `...\SalesAI_InterWork\frontend\src\pages\audio\AudioFilesPage.tsx` (1320-1340, 1771-1794)
