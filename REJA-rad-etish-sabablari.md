# TASK (implementatsiya agenti uchun): "Rad etish sabablari" cardini Bitrix'da ishlatish

> Loyiha: `D:\Projects\Work - AsosIt\SalesAI_Rozgovor\rozgovor` (SalesAI, Bitrix24).
> Aktiv portal: `https://rozgovoruz.bitrix24.kz/rest/527/8cmow72uy63s4ewg`.
> Tanlangan yondashuv: **A usul** (quyida). Field uchun **konstanta almashtirish** (default).
> Bu spec o'zicha tushunarli — oldingi suhbatga murojaat shart emas.

---

## 0. Kontekst (nega kerak)

`/sales` sahifasidagi "Rad etish sabablari" card (`frontend/src/pages/sales/SalesPage.tsx:1707`)
`data.rejectionBreakdown.length > 0` shartida render bo'ladi. Hozir `rejectionBreakdown` **doim
bo'sh**, 2 ta qo'shilgan sabab tufayli:

1. **Noto'g'ri field ID (asosiy):** sync `bitrix-sync.ts` da `UF_CRM_1777802548185` dan o'qiydi —
   bu maydon **bu portalda yo'q** (boshqa portalniki) → DB'da barcha `SalesLead.closeReasonName = NULL`.
2. **Query filtri B:** `sales.controller.ts` da `semanticId: "F"` sharti bor, lekin bu portalda sabab
   F-deal'larga emas, `NEW`/`P` (jarayonda) deal'larga belgilanadi → field tuzatilsa ham bo'sh.

**Jonli Bitrix faktlari (2026-06-30 da tasdiqlangan):**
- To'g'ri maydon: **`UF_CRM_69CFC6BD9EFCB`** ("Sifatsiz lid"), `enumeration`, 4 qiymat:
  `1125→Noto'g'ri raqam`, `1127→Ariza qoldirmagan`, `1129→Bepul xohladi`, `1131→Chet el raqami`.
- Hozir sabab belgilangan: atigi **5 ta deal**, hammasi `NEW`/semantic `P` bosqichida.
- Shu sabab faqat **A usul** (semanticId filtrisiz) ishlaydi.

⚠️ **Kutilgan natija:** tuzatishdan keyin ham card boshida atigi ~5 deal bilan chiqadi (ma'lumot kam).
Bu kod muammosi emas — jamoa "Sifatsiz lid"ni kam to'ldiradi. Acceptance shu 5 deal chiqsa — bajarilgan.

---

## 1. O'zgarishlar (4 ta majburiy + 1 ixtiyoriy)

### EDIT 1 — Field ID (majburiy)
**Fayl:** `backend/src/services/bitrix-sync.ts` (~109-110-qator)

**TOPISH:**
```ts
// Bitrix deal "Yopilish sababi" enumeration maydoni.
const DEAL_REASON_FIELD = "UF_CRM_1777802548185";
```
**ALMASHTIRISH:**
```ts
// Bitrix deal rad etish sababi — "Sifatsiz lid" enumeration (rozgovoruz portali).
// ⚠️ UF_CRM_* ID portalga XOS. Eski UF_CRM_1777802548185 boshqa portalniki edi → bu portalda
//    yo'q bo'lgani uchun closeReasonName doim null bo'lib, card ko'rinmasdi.
const DEAL_REASON_FIELD = "UF_CRM_69CFC6BD9EFCB";
```
Bu `getDealReasonMap()` va `dealReason()`ga avtomatik tarqaladi. `syncRecentDeals` (incremental,
~257-qator) maydonni allaqachon select qiladi; `upsertDealById` (webhook) `crm.deal.get` ishlatadi
(barcha maydon qaytadi) — ikkalasi avtomatik tuzaladi, qo'shimcha o'zgarish shart emas.

### EDIT 2 — Controller: B→A filtri (majburiy)
**Fayl:** `backend/src/controllers/sales.controller.ts` (~1323-1349-qator)

**TOPISH:**
```ts
    // ─── 7) Rad etish sabablari (Yopilish sababi) ──────────────────────
    // Bitrix DEAL "Сделка провалена" (semantic F) + deal custom field
    // UF_CRM_1777802548185 ("Xato raqam", "Dubl", "Boshqa kurs olib bolgan"
    // ...). Bitrix Kanban "Сделка провалена" bilan to'liq mos. Lead/JUNK
    // emas — eski usul boshqa entity edi, mos kelmasdi.
    // BARCHA sabablar (top-N kesilmaydi) — frontendda to'liq ko'rsatiladi.
    const dealRejectRows = await prisma.salesLead.groupBy({
      by: ["closeReasonName"],
      where: (() => {
        const w: Record<string, unknown> = {
          companyId,
          semanticId: "F",
          closeReasonName: { not: null },
        };
        if (dateRange) w.closedAt = dateRange;
        if (pipelineIds) w.pipelineId = { in: pipelineIds };
        if (managerIds) w.responsibleManagerId = { in: managerIds };
        if (bitrixLeadIdsFromSources)
          w.originalLeadId =
            bitrixLeadIdsFromSources.length > 0
              ? { in: bitrixLeadIdsFromSources }
              : { in: [-1] };
        return w;
      })(),
      _count: { leadId: true },
      orderBy: { _count: { leadId: "desc" } },
    });
```
**ALMASHTIRISH:**
```ts
    // ─── 7) Rad etish sabablari ("Sifatsiz lid" — UF_CRM_69CFC6BD9EFCB) ──
    // A usul: sabab belgilangan HAR QANDAY deal (semanticId filtrisiz). Bu
    // portalda sabab F-deal'ga emas, NEW/P (jarayonda) deal'ga belgilanadi,
    // shuning uchun semanticId:"F" filtri bo'lmaydi. Davr filtri leadCreatedAt
    // (closedAt EMAS — sabab yopilmagan deal'da, closedAt reja sanasi bo'lib aldaydi).
    const dealRejectRows = await prisma.salesLead.groupBy({
      by: ["closeReasonName"],
      where: (() => {
        const w: Record<string, unknown> = {
          companyId,
          closeReasonName: { not: null },
        };
        if (dateRange) w.leadCreatedAt = dateRange;
        if (pipelineIds) w.pipelineId = { in: pipelineIds };
        if (managerIds) w.responsibleManagerId = { in: managerIds };
        if (bitrixLeadIdsFromSources)
          w.originalLeadId =
            bitrixLeadIdsFromSources.length > 0
              ? { in: bitrixLeadIdsFromSources }
              : { in: [-1] };
        return w;
      })(),
      _count: { leadId: true },
      orderBy: { _count: { leadId: "desc" } },
    });
```

### EDIT 3 — Standalone full-sync skripti (majburiy)
**Fayl:** `backend/scripts/sync-bitrix-deals.js`
Bu skript hozir reason maydonini umuman olmaydi/yozmaydi → to'liq re-sync `closeReasonName`'ni
o'chiradi. 3 ta o'zgarish kerak:

**3a.** `fetchAllDeals` select (~59-73) **va** `fetchAllClosedSales` select (~101-115) — har ikkisida
`KELISHILGAN_FIELD,` dan keyin qo'shish:
```js
        KELISHILGAN_FIELD,
        "UF_CRM_69CFC6BD9EFCB",
```

**3b.** Reason enum map (ID→label) yig'ish. `main()` ichida, deal upsert tsiklidan **oldin**
(masalan currency map yig'ilgandan keyin) qo'shish:
```js
  console.log("2c) Rad etish sabablari enum yig'ilyapti...");
  const reasonMap = new Map();
  {
    const f = await bitrixCall("crm.deal.fields");
    const items = ((f.result || {})["UF_CRM_69CFC6BD9EFCB"] || {}).items || [];
    for (const it of items) reasonMap.set(String(it.ID), String(it.VALUE));
  }
  console.log(`   ${reasonMap.size} ta sabab`);
```

**3c.** Upsert tsikli ichida (`const closedAt = ...` qatoridan keyin, ~254) reason hisoblash:
```js
    const rawReason = d["UF_CRM_69CFC6BD9EFCB"];
    const closeReasonId =
      rawReason === null || rawReason === undefined || rawReason === ""
        ? null
        : String(rawReason);
    const closeReasonName = closeReasonId
      ? reasonMap.get(closeReasonId) || null
      : null;
```
va `prisma.salesLead.upsert`'ning **create** va **update** bloklariga ikkala maydonni qo'shish:
```js
        closeReasonId,
        closeReasonName,
```

### EDIT 4 — Backfill skripti (majburiy, tarixiy ma'lumot uchun)
**Fayl:** `backend/scripts/backfill-deal-reason.js`

**4a.** `FIELD` konstantasini almashtirish (~11-qator):
```js
const FIELD = "UF_CRM_69CFC6BD9EFCB";
```
**4b.** `WH` fallback'idagi noto'g'ri portal (`psg.bitrix24.uz/...`) ni rozgovoruz'ga moslash yoki
faqat env'ga tayanish (~7-9-qator):
```js
const WH =
  process.env.BITRIX_WEBHOOK_URL ||
  "https://rozgovoruz.bitrix24.kz/rest/527/8cmow72uy63s4ewg";
```

### EDIT 5 — Frontend (IXTIYORIY, kosmetika)
**Fayl:** `frontend/src/pages/sales/SalesPage.tsx` (~1714-qator)
`maxSlices={30}` → `maxSlices={4}` (atigi 4 sabab). Boshqa o'zgarish shart emas; card o'zi chiqadi.

---

## 2. NIMA QILMASLIK kerak
- `upsertDealById` (webhook) ga tegmang — `crm.deal.get` barcha maydonni qaytaradi, EDIT 1 yetarli.
- `Company.dealRejectReasonFieldId` sozlamasini **qo'shmang** (bu default rejaga kirmaydi; faqat
  alohida so'ralganda — pastdagi "Ixtiyoriy mustahkamlash"ga qarang).
- Prisma schema'ga tegmang — `closeReasonId`/`closeReasonName` allaqachon `SalesLead`'da bor.
- `semanticId` mantig'ining boshqa joylariga (sotuv/KPI) tegmang.

---

## 3. Tekshirish / qabul mezoni

1. **Build:** `cd backend && npm run build` (yoki `tsc --noEmit`) — xatosiz.
2. **Sync + backfill** (DB ulanган muhitda):
   ```
   DATABASE_URL=... BITRIX_WEBHOOK_URL=https://rozgovoruz.bitrix24.kz/rest/527/8cmow72uy63s4ewg \
     node scripts/sync-bitrix-deals.js
   DATABASE_URL=... BITRIX_WEBHOOK_URL=...same... node scripts/backfill-deal-reason.js
   ```
3. **DB tekshiruv:** `SELECT "closeReasonName", count(*) FROM "SalesLead" WHERE "closeReasonName" IS NOT NULL GROUP BY 1;`
   → kamida 5 qator ("Noto'g'ri raqam"×2, "Chet el raqami"×2, "Bepul xohladi"×1 atrofida).
4. **API:** `GET /sales/overview` javobida `rejectionBreakdown` bo'sh emas.
5. **UI:** `/sales` → "Rad etish sabablari" card ko'rinadi, sabablar + sonlar bilan.

✅ Qabul: card 5 ta deal bilan ko'rinsa — bajarilgan. (Kam son normal — yuqoridagi ogohlantirish.)

---

## 4. Tegiladigan fayllar (xulosa)

| # | Fayl | Holat |
|---|------|-------|
| 1 | `backend/src/services/bitrix-sync.ts` (~110) | field ID → `UF_CRM_69CFC6BD9EFCB` |
| 2 | `backend/src/controllers/sales.controller.ts` (~1323-1349) | B→A + `leadCreatedAt` |
| 3 | `backend/scripts/sync-bitrix-deals.js` | select + enum map + upsert maydonlar |
| 4 | `backend/scripts/backfill-deal-reason.js` | field ID + webhook fallback |
| 5 | `frontend/src/pages/sales/SalesPage.tsx` (~1714) | `maxSlices` (ixtiyoriy) |

---

## 5. Ixtiyoriy mustahkamlash (faqat alohida so'ralganda)

Hardcode portal-mismatch bug'i qaytmasligi uchun field ID'ni `Company.dealRejectReasonFieldId`
sozlamasiga olib chiqish (`Company.salePaymentFieldId` namunasiday): Prisma migration + sync'da
Company'dan o'qish, fallback `UF_CRM_69CFC6BD9EFCB`. Default rejaga **kirmaydi**.
