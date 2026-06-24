// Serverdan olingan mezonlarni lokal DB ga qo'yish
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const CATEGORIES = [
  {
    name: "Sotuv",
    description: "Asosiy sotuv mezonlari",
    sortOrder: 1,
    criteria: [
      { name: "Salomlashish va suhbatni boshlash", sortOrder: 1, weight: 20,
        description: "<p>Qoidalar:</p><p>- Salomlashish bilan boshlashi kerak</p><p>- Mijozdan hol-ahvol so'rash</p><p>- Mijozning ismini so'rab, ismi bilan murojaat qilish</p><p>- O'zini tanishtirish va kompaniya nomini aytish</p><p>- Gaplashish uchun qulay vaqt ekanligini so'rash</p>" },
      { name: "Ehtiyojni aniqlash — SOPRANO texnikasi", sortOrder: 2, weight: 20,
        description: "<p>Mezon maqsadi:</p><p>Mijozning muammosini o‘z og‘zi bilan ayttirish, muammo oqibatini anglatish va mijozni yechim zarurligini o‘zi tan oladigan holatga olib kelish.</p><p><br></p><p>Ehtiyojni aniqlash bosqichini boshlash mijozdan savollar berishga ruxsat so'rash bilan boshlanadi. Mijozga aynan kerakli va foydali ma'lumotlarni yetkazib berish uchun mijozdan bazi ma'lumotlarni so'rab olish uchun ruxsat so'rash kerak.</p><p><br></p><p>SOPRANO — 7 bosqichli kashfiyot texnikasi:</p><p>1. S (Situation) — Mijozning hozirgi holati va sharoiti haqida savollar berildi.</p><p>2. O (Objective) — Mijozning asosiy maqsadi va nimaga erishmoqchiligi aniqlandi.</p><p>3. P (Problem) — Hozirgi muammolar va qiyinchiliklar aniqlandi.</p><p>4. R (Resources) — Budjet, vaqt va boshqa resurs imkoniyatlari tekshirildi.</p><p>5. A (Alternatives) — Mijoz ko'rib chiqqan boshqa variantlar aniqlandi.</p><p>6. N (Need) — Aniq ehtiyojlari va ustuvor talablari shakllantirildi.</p><p>7. O (Outcome) — Keyingi qadam va qaror qabul qilish jarayoni aniqlandi.</p><p><br></p>" },
      { name: "Mahsulotni tushuntirish", sortOrder: 3, weight: 20,
        description: "<p>3.1. Mahsulotni ifoda etish:</p><p>- Mahsulotni mijozning og'riqlariga bog'lash</p><p>- Faqat kerakli jihatlarini aytish</p><p>- Kuchli tomonlarni aniq ko'rsatish</p><p><br></p><p>3.2. Mahsulot qanday ishlashini tushuntirish:</p><p>- Bosqichma-bosqich, sodda, tushunarli tushuntirish</p><p><br></p><p>3.3. Manfaatlarni mustahkamlash:</p><p>- SOPRANO bosqichidagi og'riqni qayta eslatish</p><p>- Mahsulot yechimini muammo bilan bog'lash</p>" },
      { name: "E'tirozlar bilan ishlash", sortOrder: 4, weight: 20,
        description: "<p>Qoidalar:</p><p>- E'tirozga darhol javob bermaydi</p><p>- Avval barcha e'tirozlarni yig'adi</p><p>- Eng asosiy e'tirozni aniqlaydi</p><p>- Faqat asosiy e'tirozga yechim beradi</p><p>- Bahslashmaydi, himoyalanmaydi</p>" },
      { name: "Keyingi qadamga yo'naltirish", sortOrder: 5, weight: 20,
        description: "<p>Qoidalar:</p><p>- Keyingi qadamni ochiq, aniq taklif qiladi</p><p>- \"Olasizmi yo'qmi?\" degan savollarga yo'l qo'ymaydi</p><p>- Faqat \"Ha\" deb javob beriladigan savollar beradi</p><p><br></p><p>Misol uchun:</p><p>- \"Qachon to'lovni amalga oshirasiz?\"</p><p>- \"Qaysi usulda to'laysiz?\"</p><p>- \"Qaysi filialga kelasiz?\"</p>" },
    ],
  },
  {
    name: "Qayta qo'ng'iroq",
    description: "Savdoga oid mijozlar bilan takroriy qo'ng'iroqlar va qayta aloqalar",
    sortOrder: 2,
    criteria: [
      { name: "Kontekstni eslatish", sortOrder: 1, weight: 20,
        description: "<p>Mijoz bilan menejer o‘rtasidagi oldingi suhbatni tez va aniq eslatish (mijoz darrov eslasin)•\tOldingi suhbat bo‘lganini aniq eslatdi (qachon / qaysi kanalda)</p><p>•\tOldingi suhbat mavzusini 1 jumlada aytdi (nima haqida)</p><p>•\tMijoz aytgan asosiy muammo/ehtiyojni eslatdi</p><p>•\tO‘sha safar kelishilgan keyingi qadamni aytdi (masalan: “siz o‘ylab ko‘rasiz”, “men demo yuboraman”)</p><p><br></p>" },
      { name: "Oldingi to‘siqni tekshirish", sortOrder: 2, weight: 20,
        description: "<p>Nega sotuv bo‘lmay qolganini ochiq aniqlash va hozir ham o‘sha to‘siq bormi-yo‘qmi bilish</p><p>•\tOldingi e’tiroz/to‘siqni eslatdi (narx, vaqt, rahbardan ruxsat, ishonch, boshqalar)</p><p>•\t“Hozir ham shu masala turibdimi?” deb to‘g‘ridan-to‘g‘ri tekshirdi</p><p>•\tVaziyat o‘zgargan-yo‘qligini so‘radi (byudjet, ehtiyoj, ustuvorlik)</p><p>•\tAgar to‘siq qolgan bo‘lsa, sababini chuqurlashtirdi (aniq nima to‘xtatyapti?)</p><p><br></p>" },
      { name: "Yangi sabab bilan chiqish", sortOrder: 3, weight: 20,
        description: "<p>Qayta qo‘ng‘iroq “shunchaki eslatish” emas, mijozga foydali sabab bilan bo‘lishi</p><p>•\t“Nega hozir qo‘ng‘iroq qilyapman?”ni aniq aytdi</p><p>•\tYangi qiymat berdi (case, natija, yangilik, taklif, pilot, yangi funksiya)</p><p>•\tSabab mijoz ehtiyojiga bog‘landi (shunchaki umumiy gap emas)</p><p>•\t“Eslatib qo‘yish” bilan cheklanib qolmadi</p><p><br></p>" },
      { name: "Qaror holatini aniqlash", sortOrder: 4, weight: 20,
        description: "<p>Mijoz qarorining qayerga kelganini bilish va suhbatni keyingi bosqichga surish</p><p>•\tQaror qaysi bosqichda ekanini so‘radi (ko‘rib chiqyaptimi, kutyaptimi, radmi)</p><p>•\tQaror uchun nima yetishmayotganini aniqladi (info, demo, rahbar, shart, narx)</p><p>•\tQaror kim bilan birga qabul qilinishini bilib oldi (decision maker)</p><p>•\tSuhbatni “keyin gaplashamiz”da qoldirmasdan oldinga siljitdi</p><p><br></p>" },
      { name: "Closing va keyingi qadamni kelishish", sortOrder: 5, weight: 20,
        description: "<p>Qayta qo‘ng‘iroqni natija bilan yopish: aniq keyingi qadam + aniq vaqt</p><p>•\tAniq closing savol berdi (harakatga chaqiradigan)</p><p>•\tVariantli closing ishlatdi (A/B): “bugunmi yoki ertagami?”, “pilotmi yoki demo?”</p><p>•\tKeyingi qadamni kelishib oldi (demo, uchrashuv, hujjat, hisob)</p><p>•\tKeyingi aloqa vaqti aniq bo‘ldi (sana/soat yoki aniq interval)</p><p><br></p>" },
    ],
  },
  {
    name: "Boshqa",
    description: "Boshqa turdagi suhbatlar uchun umumiy kategoriya",
    sortOrder: 3,
    criteria: [
      { name: "Umumiy suhbat", sortOrder: 1, weight: 100,
        description: "Umumiy suhbatda mijoz bilan yaxshi munosabat yaratilib va mijozning ehtiyojlarini aniqlab ularga yechim taqdimlash kerak." },
    ],
  },
];

(async () => {
  const company = await prisma.company.findFirst();
  if (!company) {
    console.error("Hech qanday kompaniya topilmadi");
    process.exit(1);
  }
  console.log(`Kompaniya: ${company.name} (${company.id})`);

  // Oldin tozalash
  await prisma.criteria.deleteMany({
    where: { category: { companyId: company.id } },
  });
  await prisma.criteriaCategory.deleteMany({
    where: { companyId: company.id },
  });

  for (const cat of CATEGORIES) {
    const created = await prisma.criteriaCategory.create({
      data: {
        companyId: company.id,
        name: cat.name,
        description: cat.description,
        sortOrder: cat.sortOrder,
        criteria: {
          create: cat.criteria.map((c) => ({
            name: c.name,
            description: c.description,
            weight: c.weight,
            sortOrder: c.sortOrder,
          })),
        },
      },
      include: { criteria: true },
    });
    console.log(`✓ ${created.name} — ${created.criteria.length} ta mezon`);
  }
  await prisma.$disconnect();
  console.log("\nTayyor ✅");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
