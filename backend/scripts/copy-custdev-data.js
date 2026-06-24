// Source DB'dagi Custdev ma'lumotlarini vaqtinchalik custdev DB ga ko'chiradi.
//
// Ishlatish:
//   CUSTDEV_DATABASE_URL="postgresql://salesai:salesai123@localhost:5432/custdev_tmp" \
//   node scripts/copy-custdev-data.js
//
// Source sifatida DATABASE_URL ishlatiladi. Agar kerak bo'lsa:
//   CUSTDEV_SOURCE_DATABASE_URL="..." CUSTDEV_DATABASE_URL="..." node scripts/copy-custdev-data.js
//
// Copy tartibi:
//   1) Custdev'ga ega company'larni target DB ga ko'chiradi
//   2) Target DB'dagi o'sha company'larga tegishli eski custdev data'ni o'chiradi
//   3) Custdev -> Question -> Interview -> Answer ko'chiriladi

require("dotenv").config();
const { PrismaClient } = require("@prisma/client");

function makeClient(url) {
  return new PrismaClient({
    datasources: {
      db: { url },
    },
  });
}

function stripCompanyRelations(company) {
  return {
    id: company.id,
    name: company.name,
    username: company.username,
    password: company.password,
    plan: company.plan,
    telegramId: company.telegramId,
    telegramEnabled: company.telegramEnabled,
    sendEachAnalysis: company.sendEachAnalysis,
    dailySummaryEnabled: company.dailySummaryEnabled,
    createdAt: company.createdAt,
    isActive: company.isActive,
    managerLimit: company.managerLimit,
    totalLimitHours: company.totalLimitHours,
    audioLimitPerManager: company.audioLimitPerManager,
    excludedPipelines: company.excludedPipelines,
    salePaymentFieldId: company.salePaymentFieldId,
    courseInfo: company.courseInfo,
    topPerformerPlaybook: company.topPerformerPlaybook,
    topPerformerUpdatedAt: company.topPerformerUpdatedAt,
    objectionLibrary: company.objectionLibrary,
    objectionLibraryUpdatedAt: company.objectionLibraryUpdatedAt,
    smartTrackers: company.smartTrackers,
    salesPlanMode: company.salesPlanMode,
  };
}

function stripCustdevRelations(custdev) {
  return {
    id: custdev.id,
    companyId: custdev.companyId,
    title: custdev.title,
    description: custdev.description,
    aiSummary: custdev.aiSummary,
    createdAt: custdev.createdAt,
    updatedAt: custdev.updatedAt,
  };
}

function stripQuestionRelations(question) {
  return {
    id: question.id,
    custdevId: question.custdevId,
    text: question.text,
    section: question.section,
    sortOrder: question.sortOrder,
  };
}

function stripInterviewRelations(interview) {
  return {
    id: interview.id,
    custdevId: interview.custdevId,
    audioUrl: interview.audioUrl,
    audioKey: interview.audioKey,
    transcription: interview.transcription,
    durationSec: interview.durationSec,
    status: interview.status,
    aiSummary: interview.aiSummary,
    errorMessage: interview.errorMessage,
    createdAt: interview.createdAt,
    updatedAt: interview.updatedAt,
  };
}

function stripAnswerRelations(answer) {
  return {
    id: answer.id,
    questionId: answer.questionId,
    interviewId: answer.interviewId,
    answer: answer.answer,
    timestamp: answer.timestamp,
  };
}

async function main() {
  const sourceUrl = process.env.CUSTDEV_SOURCE_DATABASE_URL || process.env.DATABASE_URL;
  const targetUrl = process.env.CUSTDEV_DATABASE_URL || process.env.DATABASE_URL;

  if (!sourceUrl) {
    throw new Error("Source DATABASE_URL topilmadi");
  }
  if (!targetUrl) {
    throw new Error("CUSTDEV_DATABASE_URL topilmadi");
  }
  if (sourceUrl === targetUrl) {
    throw new Error("Source va target URL bir xil bo'lmasligi kerak");
  }

  console.log(`[custdev-copy] source: ${sourceUrl.replace(/:[^:@/]+@/, ":***@")}`);
  console.log(`[custdev-copy] target: ${targetUrl.replace(/:[^:@/]+@/, ":***@")}`);

  const source = makeClient(sourceUrl);
  const target = makeClient(targetUrl);

  try {
    const custdevs = await source.custdev.findMany({
      include: {
        questions: { orderBy: { sortOrder: "asc" } },
        interviews: {
          orderBy: { createdAt: "asc" },
          include: {
            answers: { orderBy: { id: "asc" } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    if (custdevs.length === 0) {
      console.log("[custdev-copy] source DB'da custdev topilmadi");
      return;
    }

    const companyIds = [...new Set(custdevs.map((c) => c.companyId))];
    console.log(`[custdev-copy] company: ${companyIds.length}, custdev: ${custdevs.length}`);

    const companies = await source.company.findMany({
      where: { id: { in: companyIds } },
    });

    const companyById = new Map(companies.map((c) => [c.id, c]));

    // Target'da eski custdev data'ni tozalaymiz
    await target.custdev.deleteMany({
      where: { companyId: { in: companyIds } },
    });

    // Company'larni target DB'ga ko'chiramiz
    for (const companyId of companyIds) {
      const company = companyById.get(companyId);
      if (!company) {
        console.log(`[custdev-copy] company topilmadi: ${companyId}`);
        continue;
      }
      const data = stripCompanyRelations(company);
      await target.company.upsert({
        where: { id: company.id },
        create: data,
        update: data,
      });
    }

    for (const custdev of custdevs) {
      await target.custdev.create({
        data: stripCustdevRelations(custdev),
      });
    }

    for (const custdev of custdevs) {
      for (const q of custdev.questions) {
        await target.custdevQuestion.create({
          data: stripQuestionRelations(q),
        });
      }
    }

    for (const custdev of custdevs) {
      for (const interview of custdev.interviews) {
        await target.custdevInterview.create({
          data: stripInterviewRelations(interview),
        });
      }
    }

    for (const custdev of custdevs) {
      for (const interview of custdev.interviews) {
        for (const answer of interview.answers) {
          await target.custdevAnswer.create({
            data: stripAnswerRelations(answer),
          });
        }
      }
    }

    const counts = await target.custdev.count({
      where: { companyId: { in: companyIds } },
    });
    const interviewCount = await target.custdevInterview.count({
      where: { custdev: { companyId: { in: companyIds } } },
    });
    const answerCount = await target.custdevAnswer.count({
      where: {
        interview: { custdev: { companyId: { in: companyIds } } },
      },
    });

    console.log(
      `[custdev-copy] done: custdev=${counts}, interviews=${interviewCount}, answers=${answerCount}`
    );
  } finally {
    await source.$disconnect();
    await target.$disconnect();
  }
}

main().catch((err) => {
  console.error("[custdev-copy] FATAL:", err.message || err);
  process.exit(1);
});
