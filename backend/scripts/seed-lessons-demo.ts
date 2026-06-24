// Vision uchun demo darsliklar seed — 2 ta kurs, har birida 2-3 modul, har
// modulda 3 ta dars (placeholder video, test savollari va AI prompt bilan).
//
// Ishga tushirish:
//   DATABASE_URL=... npx ts-node scripts/seed-lessons-demo.ts
//   DATABASE_URL=... npx ts-node scripts/seed-lessons-demo.ts --reset    # avval o'chirib qayta yozadi

import * as dotenv from "dotenv";
dotenv.config();

import { prisma } from "../src/utils/prisma";

const RESET = process.argv.includes("--reset");

interface QSeed {
  q: string;
  options: [string, string, string, string];
  correctIdx: number;
  explanation: string;
  topicTimestamp: number;
}

interface LessonSeed {
  title: string;
  description: string;
  videoDurationSec: number;
  testQuestions: QSeed[];
  aiSystemPrompt: string;
  aiKeyTopics: string[];
}

interface ModuleSeed {
  title: string;
  description: string;
  lessons: LessonSeed[];
}

interface CourseSeed {
  title: string;
  description: string;
  modules: ModuleSeed[];
}

// Yandex Object Storage'dagi real lesson videolari (sales-ai-storage bucket).
const VIDEO_POOL = [
  "https://storage.yandexcloud.net/sales-ai-storage/lessons/pro-sotuvchi-m1-0-1776886360142.mp4",
  "https://storage.yandexcloud.net/sales-ai-storage/lessons/pro-sotuvchi-m1-1-1776886549229.mp4",
  "https://storage.yandexcloud.net/sales-ai-storage/lessons/seed-1776816299338-0.mp4",
  "https://storage.yandexcloud.net/sales-ai-storage/lessons/seed-1776816333773-1.mp4",
];

const COURSES: CourseSeed[] = [
  {
    title: "Sotuvga kirish — yangi menejerlar uchun",
    description:
      "Sotuvga yangi qo'shilgan menejerlar uchun bazaviy kurs. Suhbatni boshlashdan tortib closing'gacha asosiy texnikalar.",
    modules: [
      {
        title: "1-modul. Asoslar",
        description:
          "Sotuvchi rolini, suhbat strukturasini va ovoz tonini tushunish.",
        lessons: [
          {
            title: "Sotuvchining missiyasi va etikasi",
            description:
              "Mijoz bilan ishlash falsafasi, halol sotuv qoidalari va menejer rolining muhimligi.",
            videoDurationSec: 720,
            aiSystemPrompt:
              "Siz menejer bilan sotuvchining missiyasi haqida suhbatlashayotgan AI suhbatdoshsiz. Mijozga yo'naltirilgan yondashuv, etik qoidalar, halol sotuvning afzalliklarini muhokama qiling. Menejerga o'z so'zlari bilan ifodalashni so'rang. Yakuniy javobdan keyin [END_CONVERSATION] yozing.",
            aiKeyTopics: [
              "Mijozga yo'naltirilgan sotuv",
              "Halol sotuvning ahamiyati",
              "Menejer missiyasi",
              "Etik qoidalar",
            ],
            testQuestions: [
              {
                q: "Mijozga yo'naltirilgan sotuvning asosiy tamoyili nima?",
                options: [
                  "Mijoz ehtiyojini tushunish va to'g'ri yechim taklif qilish",
                  "Iloji boricha tezroq pulni olish",
                  "Mahsulot afzalliklarini bo'rttirish",
                  "Mijozga bosim o'tkazib qaror qabul qildirish",
                ],
                correctIdx: 0,
                explanation:
                  "Asosiy tamoyil — mijoz vaziyatini, muammosini tushunib, real qiymatga ega yechim taklif qilish.",
                topicTimestamp: 60,
              },
              {
                q: "Halol sotuvning eng muhim natijasi nima?",
                options: [
                  "Bir martalik tushum",
                  "Uzoq muddatli mijoz va yaxshi reputatsiya",
                  "Tezkor closing",
                  "Yuqori bonus",
                ],
                correctIdx: 1,
                explanation:
                  "Halol sotuv mijoz ishonchini va uzoq muddatli munosabatni shakllantiradi — bu kompaniya uchun eng qimmatli aktiv.",
                topicTimestamp: 180,
              },
              {
                q: "Sotuvchi qachon mijozga MAHSULOT TAVSIYa QILMASLIGI kerak?",
                options: [
                  "Mijoz qiziqsa ham",
                  "Mahsulot mijoz ehtiyojiga to'g'ri kelmasa",
                  "Hech qachon — har doim sotish kerak",
                  "Faqat mijoz so'rasa",
                ],
                correctIdx: 1,
                explanation:
                  "Agar mahsulot mijozga to'g'ri kelmasa, halol sotuvchi tan oladi — bu uzoq muddatli ishonch quradi.",
                topicTimestamp: 360,
              },
              {
                q: "Menejer missiyasiga eng to'g'ri ta'rif qaysi?",
                options: [
                  "Plan bajarish",
                  "Mijoz hayotidagi muammoni hal qilishga yordam berish",
                  "Mahsulotni reklama qilish",
                  "Kompaniyaga foyda keltirish",
                ],
                correctIdx: 1,
                explanation:
                  "Menejer — mijoz muammosini yechishga yordamchi. Plan va foyda — natija, missiyaning o'zi emas.",
                topicTimestamp: 480,
              },
              {
                q: "Etik buzilish nima hisoblanadi?",
                options: [
                  "Mijozga vaqt berish",
                  "Mahsulot kamchiligini yashirish",
                  "Aniq narx aytish",
                  "Mijozni eshitish",
                ],
                correctIdx: 1,
                explanation:
                  "Mijozdan ma'lumotni yashirish — eng yomon etik buzilish. Bu ishonchni darhol yo'qotadi.",
                topicTimestamp: 600,
              },
            ],
          },
          {
            title: "Salomlashish va birinchi taassurot",
            description:
              "Mijoz bilan birinchi 30 soniya — qanday salomlashish, ovoz toni, kompaniya nomini aytish.",
            videoDurationSec: 540,
            aiSystemPrompt:
              "Siz menejer bilan birinchi taassurot va salomlashish texnikasi haqida suhbatlashasiz. Tasodifiy mijoz rolini o'ynab, menejerga real suhbat boshlashga imkon bering. Yakuniy javobdan keyin [END_CONVERSATION] yozing.",
            aiKeyTopics: [
              "Salomlashish formuli",
              "Birinchi taassurot",
              "Ovoz toni",
              "Kompaniya nomini aytish",
            ],
            testQuestions: [
              {
                q: "Birinchi salomlashishda QANDAY MA'LUMOT shart?",
                options: [
                  "Faqat ism",
                  "Ism + kompaniya + qisqa maqsad",
                  "Faqat kompaniya",
                  "Mahsulot narxi",
                ],
                correctIdx: 1,
                explanation:
                  "Mijoz kim qo'ng'iroq qilayotganini, qaysi kompaniyadan va nima uchunligini bilishi kerak — qisqa va aniq.",
                topicTimestamp: 30,
              },
              {
                q: "Birinchi 5 soniyada eng muhim narsa qaysi?",
                options: [
                  "Mahsulot taqdimoti",
                  "Ovozdagi ishonch va energiya",
                  "Narxni aytish",
                  "Mijoz familiyasini bilish",
                ],
                correctIdx: 1,
                explanation:
                  "Birinchi taassurot — ovoz orqali qabul qilinadi. Ishonchli, ijobiy ovoz suhbatni davom ettirishga olib keladi.",
                topicTimestamp: 90,
              },
              {
                q: "Mijoz 'siz kimsiz?' desa eng yaxshi javob:",
                options: [
                  "Sotuvchi",
                  "Ismim X, [Kompaniya] kompaniyasidan",
                  "Marketing bo'limidan",
                  "Buni bilishingiz shart emas",
                ],
                correctIdx: 1,
                explanation:
                  "Aniq, qisqa identifikatsiya — ism + kompaniya. Bu professional ko'rinish.",
                topicTimestamp: 200,
              },
              {
                q: "Salomlashish so'ng nima qilish kerak?",
                options: [
                  "Darhol mahsulot reklamasi",
                  "Mijoz vaqti borligini so'rash",
                  "Narx aytish",
                  "Mijoz familiyasini so'rash",
                ],
                correctIdx: 1,
                explanation:
                  "Mijoz vaqti borligini tasdiqlash — hurmat ko'rinishi. Vaqti yo'q bo'lsa qayta qo'ng'iroq belgilash mumkin.",
                topicTimestamp: 320,
              },
              {
                q: "Ovoz toni qanday bo'lishi kerak?",
                options: [
                  "Tinch va monoton",
                  "Energiyali, ijobiy, kulgili",
                  "Tez va shoshilgan",
                  "Past va jiddiy",
                ],
                correctIdx: 1,
                explanation:
                  "Energiya + ijobiy kayfiyat ko'pchilik mijozga yoqadi. Lekin haddan tashqari emas — tabiiy.",
                topicTimestamp: 450,
              },
            ],
          },
          {
            title: "Aktiv tinglash texnikasi",
            description:
              "Mijozni eshitish, gapini bo'lmaslik, oldingi gaplarini eslab, takrorlab tasdiqlash.",
            videoDurationSec: 660,
            aiSystemPrompt:
              "Siz menejer bilan aktiv tinglash texnikasini muhokama qilasiz. Menejerga aktiv tinglash misollari va o'z tajribasini so'zlab berishni so'rang. Yakuniy javobdan keyin [END_CONVERSATION] yozing.",
            aiKeyTopics: [
              "Aktiv tinglash",
              "Mijoz gapini bo'lmaslik",
              "Tasdiqlash texnikasi",
              "Eslab qaytarish",
            ],
            testQuestions: [
              {
                q: "Aktiv tinglash nima?",
                options: [
                  "Mijozni jim eshitish",
                  "Mijozni eshitib, ko'rsatkich beradigan reaksiya bilan",
                  "Faqat 'aha' deb takrorlash",
                  "Yozib olish",
                ],
                correctIdx: 1,
                explanation:
                  "Aktiv tinglash — eshitish + tasdiqlash + savol berish + oldingi gaplarni eslab qaytarish.",
                topicTimestamp: 60,
              },
              {
                q: "Mijoz uzoq gapirsa nima qilish kerak?",
                options: [
                  "Bo'lib o'z gapingizga o'tish",
                  "Eshitib, oxirida xulosani takrorlab tasdiqlash",
                  "Mavzuni o'zgartirish",
                  "Telefonni o'chirish",
                ],
                correctIdx: 1,
                explanation:
                  "Uzun javobni eshitib, qisqa xulosa qilib tasdiqlash mijozga ko'rsatadi: men sizni tushundim.",
                topicTimestamp: 200,
              },
              {
                q: "Mijoz gapini bo'lish qachon mumkin?",
                options: [
                  "Hech qachon",
                  "Suhbat butunlay yo'naltirilmagan bo'lsa, yumshoq qaytarib",
                  "Vaqt yo'q bo'lsa",
                  "Doim mumkin",
                ],
                correctIdx: 1,
                explanation:
                  "Aniq sababli, hurmatli ohangda yumshoq qaytarish mumkin: 'Ma'zur tutsiz, yana bir savol berishimga ruxsat berasizmi?'",
                topicTimestamp: 350,
              },
              {
                q: "Mijoz: 'Men o'tgan oy kursingizdan voz kechgandim'. Eng yaxshi javob:",
                options: [
                  "OK, davom etamiz",
                  "Ha, eslayman. Sabab nima edi va hozir vaziyat o'zgardimi?",
                  "Nima uchun?",
                  "Bu sizning tanlovingiz",
                ],
                correctIdx: 1,
                explanation:
                  "Eslab qaytarish + sabab so'rash + hozirgi vaziyat — bu professional aktiv tinglash.",
                topicTimestamp: 480,
              },
              {
                q: "Tasdiqlash uchun eng kuchli formula qaysi?",
                options: [
                  "'Aha'",
                  "'Tushundim, ya'ni siz aytmoqchisiz...'",
                  "'OK'",
                  "Sukut",
                ],
                correctIdx: 1,
                explanation:
                  "Mijoz so'zlarini o'z so'zlaringiz bilan qaytarish — eng kuchli aktiv tinglash signali.",
                topicTimestamp: 580,
              },
            ],
          },
        ],
      },
      {
        title: "2-modul. Ehtiyojni aniqlash (SOPRANO)",
        description:
          "SOPRANO texnikasi — Situation, Opinion, Problem, Reason, Action, Now, Outcome.",
        lessons: [
          {
            title: "SOPRANO formulasi va savollar",
            description:
              "Har bir harf nima anglatadi va qanday savollar berish kerak.",
            videoDurationSec: 900,
            aiSystemPrompt:
              "Siz menejerga SOPRANO ni qo'llashni o'rgatmoqdasiz. Tasodifiy mijoz vaziyatini bering va menejer SOPRANO bo'yicha savollar berishini sinab ko'ring. Yakuniy javobdan keyin [END_CONVERSATION] yozing.",
            aiKeyTopics: [
              "SOPRANO formulasi",
              "Vaziyat savollari",
              "Muammo aniqlash",
              "Oqibatlarni ko'rsatish",
            ],
            testQuestions: [
              {
                q: "SOPRANO da 'S' nimani anglatadi?",
                options: ["Sale", "Situation", "Solution", "Stop"],
                correctIdx: 1,
                explanation:
                  "S — Situation (hozirgi vaziyat). Mijozning hozir nima qilayotganini aniqlash.",
                topicTimestamp: 60,
              },
              {
                q: "'P' (Problem) bosqichida qanday savol beriladi?",
                options: [
                  "Sizda qanday muammolar bor?",
                  "Necha pulingiz bor?",
                  "Mahsulotni xohlaysizmi?",
                  "Qachon to'laysiz?",
                ],
                correctIdx: 0,
                explanation:
                  "P — muammoni aniqlash. To'g'ridan-to'g'ri yoki bilvosita muammo savollari.",
                topicTimestamp: 200,
              },
              {
                q: "'R' (Reason) — bu nima?",
                options: [
                  "Yechim",
                  "Muammoning sababi",
                  "Plan",
                  "Mijoz ismi",
                ],
                correctIdx: 1,
                explanation:
                  "R — muammo nima sababdan paydo bo'lganini aniqlash. Bu yechim taklif qilishga yo'l ochadi.",
                topicTimestamp: 350,
              },
              {
                q: "'N' (Now) qachon ishlatiladi?",
                options: [
                  "Birinchi",
                  "Mijozni 'hozir' qaror qilishga undash",
                  "Suhbat oxirida",
                  "Salomlashishda",
                ],
                correctIdx: 1,
                explanation:
                  "N — urgensiya yaratish. 'Hozir' javob talab qiladigan vaziyat ko'rsatish.",
                topicTimestamp: 500,
              },
              {
                q: "SOPRANO suhbatining maqsadi nima?",
                options: [
                  "Mijozni gapirib qo'yish",
                  "Mijoz o'z ehtiyojini ko'rishi va yechim qabul qilishi",
                  "Vaqt o'tkazish",
                  "Faqat narxni aytish",
                ],
                correctIdx: 1,
                explanation:
                  "SOPRANO orqali mijozning o'zi ehtiyojni ko'radi va yechimga ochiq bo'ladi.",
                topicTimestamp: 750,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    title: "E'tirozlar bilan ishlash — chuqur darslik",
    description:
      "Mijoz e'tirozlarining 7 turini, NLP qaytarish texnikalari va kuchli yechim taklif qilishni o'rganasiz.",
    modules: [
      {
        title: "1-modul. E'tirozlarni tanish",
        description:
          "E'tirozning 7 turi: narx, vaqt, ishonchsizlik, raqobatchilar, kerakmas, allaqachon bor, kuyovchi.",
        lessons: [
          {
            title: "Narx e'tirozi — 'Qimmat'",
            description:
              "Eng tez-tez uchraydigan e'tiroz. Sabab — bahosi qiymatdan yuqori ko'rinishi.",
            videoDurationSec: 600,
            aiSystemPrompt:
              "Siz menejer bilan 'qimmat' e'tirozi haqida suhbatlashasiz. Tasodifiy mijoz rolida 'qimmat' deb e'tiroz qiling, menejer qaytarish texnikalarini sinab ko'rsin. Yakuniy javobdan keyin [END_CONVERSATION] yozing.",
            aiKeyTopics: [
              "Narx e'tirozi",
              "Qiymatni ko'rsatish",
              "Bo'lib to'lash takliflari",
              "Reframe texnikasi",
            ],
            testQuestions: [
              {
                q: "'Qimmat' e'tirozi ortida asosan nima yotadi?",
                options: [
                  "Mahsulot kamchiligi",
                  "Qiymat aniq ko'rinmaganligi",
                  "Mijoz vaqti yo'q",
                  "Mijozda pul yo'q",
                ],
                correctIdx: 1,
                explanation:
                  "Aksariyat hollarda 'qimmat' = 'qiymat aniq emas'. Avval qiymatni aniq ko'rsatish kerak.",
                topicTimestamp: 60,
              },
              {
                q: "'Qimmat' deyilsa BIRINCHI gapirish kerak:",
                options: [
                  "Chegirma berish",
                  "Tushundim, qiymat-narx mutanosibligi muhim. Aytsangiz, sizga qaysi tomoni qimmat tuyuldi?",
                  "Bu eng arzon variant",
                  "OK, xayr",
                ],
                correctIdx: 1,
                explanation:
                  "Avval e'tirozni tan olib, sababini aniqlash. Bu mijozni eshitganligingizni ko'rsatadi.",
                topicTimestamp: 200,
              },
              {
                q: "Bo'lib to'lash taklifi qachon ishlatiladi?",
                options: [
                  "Hech qachon",
                  "Mijoz qiymatni qabul qilgan, faqat to'lov bilan muammo bo'lsa",
                  "Birinchi qadamda",
                  "Salomlashishdan keyin",
                ],
                correctIdx: 1,
                explanation:
                  "Avval qiymat — keyin to'lov shartlari. Bo'lib to'lash to'g'ri vaqtda kuchli vosita.",
                topicTimestamp: 350,
              },
              {
                q: "Reframe texnikasi nima?",
                options: [
                  "Narxni o'zgartirish",
                  "E'tirozni boshqa tomondan ko'rsatish (masalan, narxni kuniga aylantirib)",
                  "Mijozni ishontirish",
                  "Sukut",
                ],
                correctIdx: 1,
                explanation:
                  "Reframe — bir xil narsani boshqa angle'dan ko'rsatish. Masalan: '$1000' → 'Kuniga $3'.",
                topicTimestamp: 480,
              },
              {
                q: "Mijoz: 'Men 5 yilga buni to'lashim kerak'. Yaxshi javob:",
                options: [
                  "Ha to'g'ri",
                  "Ha, lekin shu 5 yil davomida 100M+ tushum qilasiz — ROI 10x",
                  "Boshqa narsa taklif qilaman",
                  "Bu juda qimmat",
                ],
                correctIdx: 1,
                explanation:
                  "Investitsiyani natija bilan solishtirish. ROI ko'rsatish 'qimmat' e'tirozini qoplaydi.",
                topicTimestamp: 540,
              },
            ],
          },
        ],
      },
    ],
  },
];

async function main() {
  const company = await prisma.company.findFirst();
  if (!company) {
    console.error("Company yo'q. Avval kompaniya yarating.");
    process.exit(1);
  }
  console.log(`Company: ${company.name} (${company.id})\n`);

  if (RESET) {
    console.log("[RESET] Eski darsliklarni o'chirish...");
    await prisma.lessonProgress.deleteMany({ where: { lesson: { companyId: company.id } } });
    await prisma.lessonAssignment.deleteMany({ where: { lesson: { companyId: company.id } } });
    await prisma.lesson.deleteMany({ where: { companyId: company.id } });
    await prisma.moduleAssignment.deleteMany({ where: { module: { companyId: company.id } } });
    await prisma.lessonModule.deleteMany({ where: { companyId: company.id } });
    await prisma.courseAssignment.deleteMany({ where: { course: { companyId: company.id } } });
    await prisma.course.deleteMany({ where: { companyId: company.id } });
    console.log("  ✓ tozalandi\n");
  }

  let totalCourses = 0;
  let totalModules = 0;
  let totalLessons = 0;
  let videoIdx = 0;

  for (let ci = 0; ci < COURSES.length; ci++) {
    const c = COURSES[ci];
    const course = await prisma.course.create({
      data: {
        companyId: company.id,
        title: c.title,
        description: c.description,
        sortOrder: ci,
      },
    });
    totalCourses += 1;
    console.log(`+ Course: ${c.title}`);

    for (let mi = 0; mi < c.modules.length; mi++) {
      const m = c.modules[mi];
      const mod = await prisma.lessonModule.create({
        data: {
          companyId: company.id,
          courseId: course.id,
          title: m.title,
          description: m.description,
          sortOrder: mi,
        },
      });
      totalModules += 1;
      console.log(`  + Module: ${m.title}`);

      for (let li = 0; li < m.lessons.length; li++) {
        const l = m.lessons[li];
        const videoUrl = VIDEO_POOL[videoIdx % VIDEO_POOL.length];
        videoIdx += 1;
        await prisma.lesson.create({
          data: {
            companyId: company.id,
            moduleId: mod.id,
            title: l.title,
            description: l.description,
            videoUrl,
            videoDurationSec: l.videoDurationSec,
            videoSizeBytes: BigInt(0),
            transcription: null,
            testQuestions: l.testQuestions as any,
            testPassScore: 80,
            aiSystemPrompt: l.aiSystemPrompt,
            aiKeyTopics: l.aiKeyTopics as any,
            status: "ready",
            sortOrder: li,
          },
        });
        totalLessons += 1;
        console.log(`    + Lesson: ${l.title} (${l.testQuestions.length} ta savol)`);
      }
    }
  }

  console.log(
    `\n[DONE] ${totalCourses} kurs · ${totalModules} modul · ${totalLessons} dars yaratildi`,
  );
  console.log(
    `\nVideo manbai: Yandex Object Storage (${VIDEO_POOL.length} ta video, cycle).`,
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
