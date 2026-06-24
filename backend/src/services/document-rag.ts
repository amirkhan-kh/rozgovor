import { prisma } from "../utils/prisma";

// Kompaniya hujjatlaridan + courseInfo dan kontekst yig'adi.
// Prosales — Bitrix24 asosida, voronkaCourseMap yo'q.
export async function getRAGContext(
  companyId: string,
  _pipelineName?: string | null
): Promise<string> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      courseInfo: true,
      documents: {
        select: { content: true, filename: true },
        orderBy: { createdAt: "desc" },
        take: 5,
      },
    },
  });

  if (!company) return "";

  const parts: string[] = [];

  // 1. Global courseInfo
  if (company.courseInfo?.trim()) {
    parts.push(`=== Kompaniya ma'lumoti ===\n${company.courseInfo.trim()}`);
  }

  // 2. Hujjatlar (har biri max 1500 belgi)
  if (company.documents?.length) {
    for (const doc of company.documents) {
      if (doc.content?.trim()) {
        parts.push(
          `=== Hujjat: ${doc.filename} ===\n${doc.content.trim().slice(0, 1500)}`
        );
      }
    }
  }

  // Max 4000 belgi
  return parts.join("\n\n").slice(0, 4000);
}
