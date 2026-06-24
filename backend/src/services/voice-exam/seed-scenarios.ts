/**
 * Seed default exam scenarios for a company (or all companies).
 * Idempotent: safe to run multiple times.
 */
import { prisma } from "../../utils/prisma";
import { DEFAULT_SCENARIOS } from "./default-scenarios";

export async function seedScenariosForCompany(companyId: string): Promise<number> {
  let created = 0;
  for (const s of DEFAULT_SCENARIOS) {
    const exists = await prisma.examScenario.findUnique({
      where: { companyId_code: { companyId, code: s.code } },
    });
    if (exists) continue;

    await prisma.examScenario.create({
      data: {
        companyId,
        code: s.code,
        name: s.name,
        description: s.description,
        difficulty: s.difficulty,
        icon: s.icon,
        order: s.order,
        systemPrompt: s.systemPrompt,
        category: s.category || "sotuv",
        isActive: true,
      },
    });
    created++;
  }
  return created;
}

export async function seedScenariosForAllCompanies(): Promise<void> {
  const companies = await prisma.company.findMany({ select: { id: true, name: true } });
  for (const c of companies) {
    const n = await seedScenariosForCompany(c.id);
    console.log(`[seed] ${c.name}: ${n} ta yangi stsenariy yaratildi`);
  }
}

// CLI: `npx ts-node src/services/voice-exam/seed-scenarios.ts`
if (require.main === module) {
  require("dotenv").config();
  seedScenariosForAllCompanies()
    .then(() => prisma.$disconnect())
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
