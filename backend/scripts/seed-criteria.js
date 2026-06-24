const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

const SOTUV = [
  {
    name: "Salomlashish va suhbatni boshlash",
    description: "Suhbat boshida menejer mijoz bilan ijobiy psixologik aloqa o'rnatishi, o'zini va kompaniyani tanitishi, mijozning vaqtini hurmat qilishi. Tekshiriladi: salomlashish, ism so'rash, o'zini tanishtirish, qulay vaqt ekanini aniqlash, salbiy signallarga sezgirlik. Kuchli versiya — jonli va samimiy ohang. Zaif versiya — shablon paroldek aytib darhol mahsulotga o'tib ketish.",
  },
  {
    name: "Ehtiyojni aniqlash — SOPRANO texnikasi",
    description: "Mijozning haqiqiy muammosini va asosiy motivini ochish — savol berish orqali, taqdimot qilmasdan. SOPRANO 7 bosqichi: Situation, Objective, Problem, Resources, Alternatives, Need, Outcome. Tekshiriladi: 60-70% vaqt mijoz gapiradimi, muammo va oqibati mijoz og'zidan eshitildimi, budjet aniqlandimi, 7 bosqichdan kamida 5 tasi yopildimi.",
  },
  {
    name: "Taqdimot — mahsulotni tushuntirish",
    description: "Aniqlangan ehtiyoj asosida mahsulotni mijoz tilida — uning og'rig'i va maqsadi bilan bog'lab — taqdim etish. Tekshiriladi: mahsulot mijoz og'rig'iga bog'lanyaptimi, Feature→Benefit mantiqi, case-studylar, narx aniq aytildimi, tushunarli bo'lganini tekshirish. Kuchli — 2-3 daqiqa, aniq misol bilan. Zaif — 10 daqiqalik kursni A dan Z gacha sanash.",
  },
  {
    name: "E'tirozlar bilan ishlash",
    description: "Mijozning shubha va e'tirozlarini 'yo'q' deb qabul qilmasdan, sababini aniqlash va aniq dalil bilan javob berish. Asosiy turlari: narx, vaqt, ishonch, muqobil, qaror egasi. Algoritm: eshitish → tushunish → sababni aniqlash → dalil bilan javob → tasdiqlash. Kuchli — e'tirozni qiziqish belgisi sifatida ko'radi. Zaif — 'yo'q-yo'q' yoki sukut.",
  },
  {
    name: "Bosim — closing va keyingi qadamga olib kelish",
    description: "Mijozni qarorga olib kelish — yumshoq, lekin aniq taklif bilan. Bosim ≠ tajovuzkorlik. Tekshiriladi: aniq keyingi qadam taklif qilindimi, 'nega aynan hozir?' sababi, yumshoq closing texnikalar (assumption close), mijozni 'o'ylab ko'rasiz' deb qoldirib ketmaslik. Kuchli — oxirida aniq vaqt va aniq harakat. Zaif — closing yo'q, lid sovuq holatga qaytadi.",
  },
  {
    name: "Kayfiyat — ovoz tonusi va energiya",
    description: "Menejer ovozi suhbat davomida ijobiy bo'lishi. Mijoz menejer ovozidan ishonch va qiziqishni eshitishi kerak — robotcha ohang konversiyani 30-50% pasaytiradi. Tekshiriladi: kulgi va iliqlik, tezlik mosligi, monoton emaslik, 'ahh-uhmm' va uzoq sukutlar kamayganmi, suhbat oxirida ham energetik ekanmi. Kuchli — kulgili, samimiy, mirroring. Zaif — 'yana bir client' tonida.",
  },
  {
    name: "Aktiv tinglash",
    description: "Menejer faqat gapirish emas, mijozni eshitishi kerak. Texnikalar: paraphrase ('yani siz aytmoqchisizki...'), tasdiqlash ('tushunaman'), aniqlash savoli, ovoz bilan ishtirok ('uh-hum'), kalit so'zlarni qaytarish, sukut. Tekshiriladi: mijoz so'zini bo'lish kamaymi, mijoz aytgan ma'lumotlar keyinchalik qaytib chiqdimi, paraphrase ishlatildimi, empatiya bildirildimi.",
  },
];

const QAYTA = [
  SOTUV[0],
  {
    name: "Kontekstni eslatish — oldingi suhbatga bog'lash",
    description: "Qayta qo'ng'iroqda menejer ehtiyojni qaytadan aniqlamaydi — buning o'rniga oldingi suhbat KONTEKSTINI eslatadi. Tekshiriladi: 'oldingi gaplashganimizda siz ... dedingiz' bilan boshlash, mijoz aytgan aniq jumla qaytarib eslatildimi, oldingi to'siq eslatildimi, vaqt o'tgani inobatga olindimi, SOPRANO savollarini qaytarmaydimi, mijoz o'zgargan vaziyatga moslashdimi.",
  },
  SOTUV[2],
  SOTUV[3],
  SOTUV[4],
  SOTUV[5],
  SOTUV[6],
];

(async () => {
  const company = await p.company.findFirst({ select: { id: true, name: true } });
  if (!company) {
    console.error("company not found");
    process.exit(1);
  }
  console.log("company:", company.name, company.id);

  const sotuvCat = await p.criteriaCategory.create({
    data: {
      name: "Sotuv",
      description: "Birinchi qo'ng'iroq — yangi lid bilan ishlash",
      companyId: company.id,
      sortOrder: 1,
    },
  });
  console.log("Sotuv kategoriyasi:", sotuvCat.id);

  for (let i = 0; i < SOTUV.length; i++) {
    await p.criteria.create({
      data: {
        name: SOTUV[i].name,
        description: SOTUV[i].description,
        categoryId: sotuvCat.id,
        weight: 14,
        sortOrder: i + 1,
      },
    });
  }
  console.log(`  → ${SOTUV.length} ta mezon qo'shildi`);

  const qaytaCat = await p.criteriaCategory.create({
    data: {
      name: "Qayta qo'ng'iroq",
      description: "Takroriy aloqa — kontekstni eslatib davom ettirish",
      companyId: company.id,
      sortOrder: 2,
    },
  });
  console.log("Qayta qo'ng'iroq kategoriyasi:", qaytaCat.id);

  for (let i = 0; i < QAYTA.length; i++) {
    await p.criteria.create({
      data: {
        name: QAYTA[i].name,
        description: QAYTA[i].description,
        categoryId: qaytaCat.id,
        weight: 14,
        sortOrder: i + 1,
      },
    });
  }
  console.log(`  → ${QAYTA.length} ta mezon qo'shildi`);

  await p.$disconnect();
  console.log("DONE");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
