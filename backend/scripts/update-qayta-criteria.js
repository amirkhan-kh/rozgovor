const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

const QAYTA = [
  {
    name: "Kontekstni eslatish — oldingi suhbatga bog'lash",
    description: "Qayta qo'ng'iroqda menejer ehtiyojni qaytadan aniqlamaydi — buning o'rniga oldingi suhbat KONTEKSTINI eslatadi. Tekshiriladi: 'oldingi gaplashganimizda siz ... dedingiz' bilan boshlash, mijoz aytgan aniq jumla qaytarib eslatildimi, oldingi to'siq eslatildimi, vaqt o'tgani inobatga olindimi, SOPRANO savollarini qaytarmaydimi, mijoz o'zgargan vaziyatga moslashdimi.",
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

(async () => {
  const company = await p.company.findFirst({ select: { id: true, name: true } });
  console.log("company:", company.name);

  const cat = await p.criteriaCategory.findFirst({
    where: { companyId: company.id, name: "Qayta qo'ng'iroq" },
  });
  if (!cat) {
    console.error("Qayta kategoriyasi topilmadi");
    process.exit(1);
  }
  console.log("category:", cat.id);

  const deleted = await p.criteria.deleteMany({ where: { categoryId: cat.id } });
  console.log("deleted:", deleted.count);

  const weight = Math.floor(100 / QAYTA.length);
  for (let i = 0; i < QAYTA.length; i++) {
    await p.criteria.create({
      data: {
        name: QAYTA[i].name,
        description: QAYTA[i].description,
        categoryId: cat.id,
        weight,
        sortOrder: i + 1,
      },
    });
  }
  console.log(`${QAYTA.length} ta yangi mezon qo'shildi (weight=${weight}% har biri)`);
  await p.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
