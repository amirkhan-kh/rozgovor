# REJA — "Aloqaga chiqish" vaqti: Chet el ajratish (Sotuv + Audit)

**Sana:** 2026-07-02
**Holat:** ✅ BAJARILDI + lokalda tasdiqlandi (2026-07-02). Backend tsc + frontend build xatosiz.
Audit Lead-join 61/62 mos (avval SalesLead ~0) → `/audit` endi 0 emas. Sotuv telefon-map'da
201 Chet el lid (foreign.leadsCount>0). Lokalda Chet el lidlarda audio yo'q → Chet el o'rtacha
"—" (contacted=0); prod'da to'ladi, ajratish logikasi to'g'ri.

## Maqsad

1. Sotuv va Auditning **ikkalasida** "Aloqaga chiqish" o'rtachasidan **Chet el kanbaniga**
   o'tgan lidlarni **chiqarib tashlash** (main = Chet el'siz).
2. Chet el kanbanidagi o'rtacha aloqaga chiqish vaqtini **alohida** ko'rsatish —
   **ham Umumiy, ham Ish vaqti bo'yicha**.
3. Audit kartasi ko'rinishi **Sotuv bo'limidagi bilan bir xil** bo'lsin.
4. ⚠️ **MUHIM (yangilangan qaror):** Audit **o'zining mavjud hisoblash logikasini**
   saqlaydi — sotuv logikasiga o'tkazilmaydi. O'sha logikaga faqat **qo'shimchalar**
   qo'shiladi (Lead join tuzatish + ish vaqti + Chet el ajratish).

---

## Topilgan faktlar (Bitrix + lokal DB, 2026-07-02)

- **"Chet el kanban" = Bitrix LEAD statusi `UC_IISBVC` ("Chet el raqami")** — leadlar
  kanban ustuni (deal pipeline EMAS). `crm.status.list` (ENTITY_ID=STATUS) dan tasdiqlangan.
  Lokalda `Lead.statusId="UC_IISBVC"` bo'yicha ~842 lid.
- **BACKFILL KERAK EMAS** — `Lead.statusId` odatdagi lead sync'ida keladi.
- ⚠️ **`statusName` ISHONCHSIZ** (ko'p `null` + drift). **`statusId` bo'yicha** filtrlaymiz.
- **`AudioFile.leadId` = `Lead.bitrixLeadId`** (lokal: 73 dan 71 mos), **`SalesLead.leadId`ga
  0 mos**. Ya'ni auditning hozirgi `SalesLead` join'i bu tenantda **hech narsa qaytarmaydi** —
  metrika amalda bo'sh. Shu join **`Lead`ga** o'tkazilishi kerak (bu ham qo'shimcha/tuzatish).
- Portalga xos UC_ status ID'lar kodda allaqachon hardcode qilingan
  (`sales.controller.ts:305`) — konvensiyaga mos.

## Hozirgi holat

**Sotuv** (`sales.controller.ts`, `kpiFromLeads=true`): `Lead.dateCreate` + telefon
(`Lead.clientPhone ↔ AudioFile.phoneNumber`) + ish vaqti. Karta: Umumiy | Ish vaqti | Lidlar.

**Audit** (`audit.controller.ts` `getAuditOverview`): `AudioFile.firstContactAt||callDate`
(leadId bo'yicha, per-lid eng erta) − `SalesLead.leadCreatedAt`; faqat wall-clock, bitta raqam.
Karta: bitta `KpiCard`. **SalesLead join 0 mos → amalda 0.**

---

## Yangi karta ko'rinishi (Sotuv va Audit — bir xil)

3 ustun; har ustun ostida **Chet el** qiymati alohida qatorda:

```
Aloqaga chiqish
Lid yaratilgandan birinchi aloqagacha

   Umumiy            |  Ish vaqti bo'yicha  |   Lidlar
   3.2 soat          |     1.5 soat         |   120 ta
   Chet el: 6.1 soat |  Chet el: 4.0 soat   |   80 aloqa · Chet el 12
```

- **Umumiy** = main (Chet el'siz) wall-clock; ostida Chet el wall-clock.
- **Ish vaqti bo'yicha** = main business-hours; ostida Chet el business-hours.
- **Lidlar** = main lid soni + aloqa soni; Chet el lid soni.

> Aniq piksel joylashuv implement/review paytida moslashadi; asos — sotuv kartasi uslubi.

---

## Implementatsiya

### Backend — Sotuv (`sales.controller.ts`)
O'z logikasini saqlaydi, faqat kengaytiriladi (`if (kpiFromLeads)` bloki, ≈1143-1198):
- `LEADS_FOREIGN_STATUS_ID = "UC_IISBVC"` konstanta (mavjud UC_ konstanta yonida).
- `Lead.findMany` select'iga **`statusId: true`** qo'shish; telefon-map'da eng erta lidning
  `statusId`ini saqlash.
- Gap'larni **ikki bucketga** ajratish: main (`statusId!=UC_IISBVC`) va foreign.
- Har bucket uchun `avgHours` **va** `avgWorkHours` (mavjud `businessHoursBetween`).
- `timeToContact` javobiga qo'shish:
  `{ avgHours, avgWorkHours, totalLeadsCount, contactedLeadsCount,
     foreign: { avgHours, avgWorkHours, leadsCount, contactedLeadsCount } }`.
- (deals branch — foreign nol, o'zgarmaydi.)

### Backend — Audit (`audit.controller.ts` `getAuditOverview`)
O'z logikasini saqlaydi (contactAt = `firstContactAt||callDate`, leadId bo'yicha per-lid
eng erta), quyidagi **qo'shimchalar** bilan (≈205-244 bloki):
1. **Join tuzatish:** `SalesLead.findMany({leadId})` → **`Lead.findMany({ bitrixLeadId: { in
   leadIds } })`**, select: `bitrixLeadId, dateCreate, statusId, responsibleManagerId`.
   `created` = `Lead.dateCreate` (SalesLead.leadCreatedAt o'rniga; 0-mos bug'ini tuzatadi).
2. **Ish vaqti:** company `adminWorkStart/End` + `managerSchedule` dam kunlarini olib,
   har gap uchun `businessHoursBetween(...)` (mas'ul menejer = `Lead.responsibleManagerId`).
3. **Chet el ajratish:** gap'larni `statusId===UC_IISBVC` bo'yicha main/foreign bucketga.
4. Javobga sotuv bilan bir xil shakldagi `timeToContact` obyektini qo'shish (yuqoridagi kabi).
   Eski `kpis.avgTimeToContactHours` qolaversin (zararsiz) yoki `timeToContact.avgHours`dan olsin.
- `LEADS_FOREIGN_STATUS_ID` — sotuv bilan bir manbadan import (kichik shared const yoki
  ikkalasida bir xil ta'rif).

### Frontend
- `sales.service.ts` — `SalesTimeToContact`ga `foreign: {avgHours, avgWorkHours, leadsCount,
  contactedLeadsCount}` qo'shish.
- `audit.service.ts` — `AuditOverview`ga `timeToContact: SalesTimeToContact`-ga o'xshash tip.
- `SalesPage.tsx` (≈1530-1590) — kartani yuqoridagi 3-ustun + Chet el qatori ko'rinishiga
  keltirish (`foreign.avgHours`, `foreign.avgWorkHours`, `foreign.leadsCount`).
- `AuditPage.tsx` — pastki grid'dagi bitta `KpiCard`ni (≈1057-1063) olib tashlab
  (grid `md:grid-cols-4`→`3`), sotuvdagi bilan **bir xil** `Card`ni qo'shish. `Card` import
  bor; `formatHoursOrDays`ni SalesPage'dan ko'chirish.

---

## Tekshiruv (Definition of Done)

- [x] `cd backend && npx tsc --noEmit` va `cd frontend && npm run build` — xatosiz.
- [x] `/audit` da aloqaga chiqish endi **0 emas** (Lead join 61/62 mos; avg=99.4h/38h).
- [x] Ikkala kartada Umumiy + Ish vaqti + Chet el (Umumiy va Ish vaqti) ko'rinadi.
- [x] Main o'rtachaga Chet el qo'shilmagani, foreign faqat Chet el (bucket ajratish tasdiqlandi).
- [x] Sotuvda `foreign.leadsCount = 201 > 0`. Audit'da 0 (lokalda Chet el lidlarda audio yo'q — feature jim o'chadi).

## Xatarlar / izohlar

- `UC_IISBVC` portalga xos — boshqa tenantda status yo'q bo'lsa `foreign` bo'sh, main
  o'zgarmaydi (feature jim o'chadi).
- Sotuv va Audit **har xil metodni** saqlaydi (sotuv=telefon+callDate; audit=leadId+
  firstContactAt||callDate) — foydalanuvchi shuni so'radi ("har biri o'z logikasi"). Demak
  sonlar biroz farq qilishi mumkin; bu kutilgan.
- Audit business-hours uchun `Lead.responsibleManagerId` ishlatiladi (audio mas'uli emas).
