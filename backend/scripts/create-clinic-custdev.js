/**
 * Klinika uchun Custdev loyihasini yaratadi va savollarni qo'shadi.
 * Usage: DATABASE_URL="..." node scripts/create-clinic-custdev.js
 */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const QUESTIONS = [
  // ─── Umumiy ma'lumot ───────────────────────────────────────────
  { section: "Umumiy ma'lumot", text: "Mijoz ismi?" },
  { section: "Umumiy ma'lumot", text: "Telefon raqami" },
  { section: "Umumiy ma'lumot", text: "Yoshi" },
  { section: "Umumiy ma'lumot", text: "Jinsi" },
  { section: "Umumiy ma'lumot", text: "Qanday faoliyat bilan shug'ullanasiz?" },

  // ─── Presale bo'limi ───────────────────────────────────────────
  { section: "Presale", text: "Siz bizning klinikamiz haqida qayerdan ma'lumot oldingiz?" },
  { section: "Presale", text: "Nimaga aynan bizning klinikamizni tanladingiz?" },
  { section: "Presale", text: "Qanday muammo bilan bizga murojaat qilgandingiz?" },
  { section: "Presale", text: "Doktorlarimiz konsultatsiyalaridan qay darajada mamnunsiz?" },
  { section: "Presale", text: "Registraturadagi qizlarning xizmat darajasini baholay olasizmi? 1 dan 10 gacha baholang (tezlik va muomala jihatdan)" },

  // ─── Sale ──────────────────────────────────────────────────────
  { section: "Sale", text: "Doktor konsultatsiyasiga kirish jarayoni qay darajada sizga qulay bo'ldi — ortiqcha navbatlarda kutib qolmadingizmi, o'z vaqtida konsultatsiyaga kirdingizmi?" },
  { section: "Sale", text: "Muolaja jarayonida sizni nimalar ikkilantirdi: narxi, diagnoz natijalari aniqliligi, davolash jarayonlari?" },
  { section: "Sale", text: "Bizdan boshqa yana boshqa shifoxonalarda davolanganmisiz?" },
  { section: "Sale", text: "Bizning shifoxonamizni ulardan ajratib turadigan farqlar nimadi?" },

  // ─── After Sales ──────────────────────────────────────────────
  { section: "After Sales", text: "Sizni ogohlantirilmagan qo'shimcha jarayonlar bo'lmadimi? Masalan: qo'shimcha narx, analiz, protseduralar?" },
  { section: "After Sales", text: "Shu muammoyingizga qay darajada qoniqarli yechim oldingiz? 1 dan 10 gacha baholab bering" },
  { section: "After Sales", text: "Xizmatimiz narxiga mosmi — qimmat emasmi, narxiga arziydimi?" },
  { section: "After Sales", text: "Shifoxonamizda nimani yana yaxshilashimizni taklif qilgan bo'lardingiz?" },
  { section: "After Sales", text: "Klinikamiz qulayligini baholang: tozalik, interyer" },
  { section: "After Sales", text: "Xizmatimizni yana biror tanishingizga tavsiya qilgan bo'larmidingiz?" },
  { section: "After Sales", text: "Kinezolog muolajasini oldingizmi? Uni muolajasidan o'zingizda qanchalik foizda foyda ko'rdim deb hisoblaysiz?" },
  { section: "After Sales", text: "Umumiy xizmatimizni 1 dan 10 gacha baholasangiz nechi qo'ygan bo'lardingiz?" },
  { section: "After Sales", text: "Bizning klinikaga kelishdagi kutuvingiz qanday edi va qanchalik yechim topdingiz?" },
];

async function main() {
  // First company
  const company = await prisma.company.findFirst();
  if (!company) {
    console.error("Kompaniya topilmadi");
    process.exit(1);
  }

  console.log("Kompaniya:", company.name, "(", company.id, ")");

  // Create custdev
  const custdev = await prisma.custdev.create({
    data: {
      companyId: company.id,
      title: "Klinika mijozlar tahlili",
      description: "Klinikaga kelgan bemorlardan fikr-mulohaza olish uchun — presale, sale va after-sales bosqichlari bo'yicha savollar.",
      questions: {
        create: QUESTIONS.map((q, idx) => ({
          text: q.text,
          section: q.section,
          sortOrder: idx,
        })),
      },
    },
    include: {
      questions: { orderBy: { sortOrder: "asc" } },
    },
  });

  console.log("\n✅ Custdev yaratildi:");
  console.log("   ID:", custdev.id);
  console.log("   Nom:", custdev.title);
  console.log("   Savollar:", custdev.questions.length, "ta\n");

  // Group by section
  const sections = {};
  for (const q of custdev.questions) {
    const s = q.section || "Boshqa";
    if (!sections[s]) sections[s] = [];
    sections[s].push(q.text);
  }
  for (const [sec, qs] of Object.entries(sections)) {
    console.log(`  📋 ${sec} (${qs.length} savol):`);
    qs.forEach((q, i) => console.log(`     ${i + 1}. ${q}`));
    console.log();
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
