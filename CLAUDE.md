# SalesAI — ProSales Group instansiyasi

AI sotuv tahlili platformasi. Bitrix24'dan qo'ng'iroq + lid + dealni sync qiladi, Vertex AI orqali transkript va 21 maydonli analiz qiladi, menejerlar samaradorligini hisoblab dashboard / reyting / sotuv panelda ko'rsatadi. Custdev, darslar, imtihon, sertifikat, celebration video — qo'shimcha modullar.

## Stack

**Backend:** Node.js + Express + TypeScript, Prisma + PostgreSQL — `backend/`
**Frontend:** React 18 + Vite + TailwindCSS + TanStack Query + react-router-dom v6 — `frontend/`
**AI:**
- Vertex AI (`big-quanta-469517-h6`, `us-central1`) — Chirp_2 STT + Gemini 2.5 Flash diarization + Gemini 2.5 Pro analiz, **batch only**
- Google GenAI (Veo 3) — celebration video
- Yandex SpeechKit — alternativ STT (`yandex-stt.ts`)
**Storage:** Yandex Object Storage (`sales-ai-storage`) audio/video uchun, GCS bucketlar STT batch uchun
**CRM:** Bitrix24 webhook — `https://prosalesgroup.bitrix24.ru/rest/10/bi48ru99uyeu7dag/` (2026-04 da AmoCRM'dan migratsiya)
**Realtime:** ws (WebSocket), node-cron scheduler, Telegram bot
**Deploy:** PM2 on Hetzner (157.180.46.214). Process nomi: `salesai-backend` (`ecosystem.config.js`, script: `dist/server.js`)

## Ishchi katalog

Loyiha root: `/home/grafeas/WORK/Agents/SalesAi | Bitrix | Prosales/`

```
backend/
├── src/
│   ├── server.ts              — entry (PORT=5000 default)
│   ├── app.ts                 — Express app, ~40 ta route
│   ├── controllers/           — 38 controller (sales, dashboard, rating, audit, leads, lessons, custdev, ...)
│   ├── routes/
│   ├── services/              — biznes logika (bitrix-sync, processor, batch-backfill, lesson-batch, custdev-batch, manager-videos, sale-watcher, scheduler, telegram, websocket, ...)
│   ├── agents/                — 6 layerli AI agent pipeline
│   │   ├── layer2-quality       (validator, pattern-miner)
│   │   ├── layer3-intelligence  (benchmark, strategist)
│   │   ├── layer4-delivery      (feedback, progress, trainer)
│   │   ├── layer5-advanced      (knowledge-distiller, red-alert, rival)
│   │   └── layer6-meta          (batch-scheduler, guardian)
│   ├── middlewares/
│   └── utils/
├── prisma/schema.prisma       — 48 model
├── knowledge_base/way_of_the_wolf_uz.md  — analiz prompt konteksti
├── credentials/               — GCP service account
├── scripts/                   — 60+ bir martalik CLI (sync, backfill, reanalyze, lesson seed, custdev, ...)
├── public/videos/             — celebration videolar (statik)
├── ecosystem.config.js        — PM2 config
└── .env

frontend/src/
├── pages/                     — sales, audit, rating, dashboard, managers, audio, lessons, custdev, exam, voronka, knowledge, playlists, scenario, scripts, search, clients, coach, practice, benchmark, rivals, videos, activities, profile, design-system, auth
├── services/                  — API klientlar (sales.service.ts, ...)
├── components/layout/MainLayout.tsx
├── store/authStore.ts
└── router/                    — eager imports, role-based landing (admin → /sales, sotuvchi → /audio)
```

## Ishga tushirish

```bash
# Backend (port 5000)
cd backend && npm run dev   # nodemon + ts-node src/server.ts

# Frontend (port 5173)
cd frontend && npm run dev  # vite
```

**Localda muhim env'lar:** `DISABLE_TELEGRAM=1` (server bot 409 conflict), `DISABLE_SCHEDULER=1` (prod scheduler/AmoCRM auto-refresh prod DB'ga aralashmasligi uchun).

Skript misoli:
```bash
cd backend
DATABASE_URL="..." node scripts/sync-bitrix-deals.js
DATABASE_URL="..." node scripts/sync-bitrix-calls.js 3 30
```

## Asosiy modullar

### 1. Sotuv panel (`/sales`)
Bitrix sync data ustida. KPI grid 3×2:
1. Lid soni (barcha leadlar)
2. Kval lid (`Lead.isConverted = true` — Bitrix `STATUS_ID=CONVERTED`)
3. Konversiya = `sotuvCount / kvalCount × 100` (jami lidga emas, **kval lidga** bo'linadi)
4. Sotuv soni (`SalesLead.isSale = true` — `STAGE_SEMANTIC_ID=S`)
5. Umumiy tushum (UZS)
6. O'rtacha chek

Har KPI'da DeltaBadge — oldingi teng davr bilan trader-style up/down.

Filter tartibi: **Bu oy → Bu hafta → Bugun** + Calendar (custom range).

Pie chartlar:
- Menejerlar (markazda hover info, yonida legend: lid · kval · sotuv · konversiya%)
- Rad etish sabablari (Uzbek stage nomlari, top 6 + "Boshqalar")

⚠️ "Lid taqsimoti" pie chart **olib tashlangan** — qaytarib qo'ymaslik.

### 2. Audit / Audio (qo'ng'iroq tahlili)
Pipeline batch'da:
1. **STT** — Chirp_2, GCS bucket
2. **Diarization** — Gemini 2.5 Flash (timestamp + Mijoz/Menejer)
3. **Analysis** — Gemini 2.5 Pro (21 maydonli struktura, kontekst sifatida `way_of_the_wolf_uz.md` va Company `courseInfo`)

⚠️ **Backfill / reanalyze faqat Vertex AI batch.** Per-file online loop qat'iyan **emas**.

### 3. Reyting / Dashboard / Plan
Menejer KPI'lari, sotuv plan rejimi: `Company.salesPlanMode = "count" | "amount"` — Reyting > Sotuv jadvalida Summa ustuni shunga bog'liq. Faol bo'limlar: `Company.activeDepartmentIds` (bo'sh = auto, aktiv menejeri borlari).

### 4. Darslar (Lesson / Module / Course)
Admin yuklaydi → menejerlar uchun assign + progress kuzatuv. `lesson-batch.ts` AI bilan transkript/savollar.

### 5. Custdev
Mijoz intervyu suhbatlari — alohida pipeline, `custdev-batch.ts` + `custdev-processor.ts`.

### 6. Imtihon (voice exam)
ExamScenario + ExamSession. Imtihon suhbat uzun bo'lishi mumkin → `server.timeout = 0`.

### 7. Manager Celebration Videos (Wave 4)
Veo 3 + ffmpeg music mix, `/api/managers/:id/...` va `/api/manager-videos/:videoId/...`. Statik: `/videos`.

### 8. Sertifikat
PDF generatsiya (`certificate.service.ts`, `pdf-lib` + `fontkit`).

## Bitrix24 integratsiyasi

**Webhook:** `https://prosalesgroup.bitrix24.ru/rest/10/bi48ru99uyeu7dag/` — POST + JSON body (GET filterlar **ishlamaydi**).

Asosiy methodlar:
- `crm.deal.list` — filter + select + order + start (pagination)
- `crm.lead.list` — `STATUS_ID=CONVERTED` → kval lid
- `crm.dealcategory.list` (pipeline; 0 kelmaydi, qo'lda "Asosiy")
- `crm.dealcategory.stage.list` — `STATUS_ID` allaqachon `C<N>:NEW` formatida; **prefix qo'shmaslik**
- `user.get`, `crm.activity.list`, voximplant qo'ng'iroqlari

Stage semantic:
- `S` → won (sotuv)
- `F` → failed (rejection breakdown)
- `P` → jarayonda

Sync tartibi (3 oy davr):
```
sync-bitrix-departments → sync-bitrix-users → sync-bitrix-leads → sync-bitrix-deals → fix-stage-names (kerak bo'lsa)
sync-bitrix-calls [days=3] [minDurationSec=30]
```

Lead upsert FK violation oldini olish: avval `bitrix_<ID>` formatida placeholder Manager.

## Data modellar (asosiylari)

```
Company (1) ──┬── (N) Manager
              ├── (N) SalesLead   — Bitrix dealsdan
              ├── (N) Lead        — Bitrix leadsdan (kval)
              ├── (N) AudioFile + Analysis
              ├── (N) Department  — bo'limlar
              ├── (N) Course / LessonModule / Lesson
              ├── (N) Custdev
              └── (N) Scenario / ExamScenario / ExamSession
```

48 model jami: Manager, ManagerVideo, AudioFile, Analysis, WeeklyStrategy, ManagerProgress, GoldenMoment, Competitor, Persona, RedAlert, DailyLesson, PracticeSession, CoachFeedback, CleanedAnalysis, AmoCredential, CriteriaCategory, Criteria, SalesPlan, ManagerSalesPlan, Client, ManagerSchedule, ManagerTalkTarget, PipelineStageMapping, ChatSession, Summary, ExamScenario, ExamSession, TtsCache, FeaturePermission, SalespersonStats, Lead, SalesLead, Scenario, Course/LessonModule/Lesson + assignments, LessonProgress, Permission, Custdev*, Department, Activity.

Muhim maydonlar:
- `Company.courseInfo` (Markdown) — analiz promptga kontekst
- `Company.salePaymentFieldId` — AmoCRM "Дата платежа" custom field (closed_at o'rniga)
- `SalesLead`: `pipelineId, statusName (Uzbek), price, isSale, leadCreatedAt, closedAt, amocrmUserId` (AmoCRM legacy nom — Bitrix ID saqlanadi)
- `Lead`: `bitrixLeadId, statusId, isConverted, dateCreate, bitrixUserId`

## Timezone

Tashkent UTC+5. Backend `tashkentStartOfDay(y, m, d)` = `Date.UTC(y, m-1, d, -5, 0, 0)`. Frontend local date string yuboradi.

⚠️ `new Date(dateStr).toISOString().split("T")[0]` **ishlatmaslik** — March 1 Tashkentni Feb 28 UTCga buradi.

## Server (production)

```bash
ssh root@157.180.46.214        # parol: kVxrHupUkcek
# Backend: /var/www/salesai-backend (pm2 nomi: salesai-backend)
# ProSales alohida instans: prosales-backend (boshqa repo, aralashtirmaslik)
# Postgres: parol grafeasPostgressAsosit2026
```

⚠️ Lokalda DB clean qilganda **serverga tegmaslik**. Aniq so'ramasdan production'ga deploy/migrate yo'q.

## Tez-tez tushgan xatolar

- **Timezone bug:** `toISOString().split("T")[0]` UTC konvertatsiya. Hammasi Tashkent TZ.
- **Konversiya 101%:** leads `leadCreatedAt`, sales `closedAt` — kesishadi. Cohort-based hisoblash.
- **Stage code ko'rinib qolishi:** sync'da prefiksni ikki marta qo'yish. To'g'risi: `stageMap.set(s.STATUS_ID, s.NAME)`.
- **FK violation:** Bitrix user yo'q → avval placeholder Manager.
- **Bitrix 401:** webhook key typo. To'g'ri: `bi48ru99uyeu7dag`.
- **Filter GETda ishlamaydi:** POST + JSON body.

## O'chirilgan feature'lar (qaytarmaslik)

DealBoard · Qayta ishlash (re-engagement) · Recycling · Personajlar · "Lid taqsimoti" pie chart (sotuv sahifasida).

## User stili

Uzbek (lotin). Qisqa, signal-only javoblar. "Togri qilib ber", "davom et", "ol korchi" tipik. Tushuntirishsiz natija — afzal.
