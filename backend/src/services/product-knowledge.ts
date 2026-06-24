// Audio tahlili uchun dinamik knowledge kontekst.
//
// Pattern:
//   audio → productId → Product.knowledgeBase + ProductDocument.summary[]
//   agar productId yo'q bo'lsa → Company.courseInfo fallback
//
// Inline injection (chinakam RAG emas — Gemini context window'iga ~4-8K chars).
// call-analyzer.ts'ning `courseInfo` parametri o'rniga ishlatiladi — signature
// o'zgarmaydi, faqat dinamik to'ldiriladi.

import { prisma } from "../utils/prisma";

const MAX_PRODUCT_KNOWLEDGE = 8000; // chars — ~2000 token
const MAX_DOC_SNIPPET = 1500;

/**
 * AudioFile uchun knowledge kontekst.
 * — productId bor → mahsulot knowledgeBase + documents summary
 * — yo'q → Company.courseInfo
 */
export async function getKnowledgeForAudio(audioId: string): Promise<string> {
  const audio = await prisma.audioFile.findUnique({
    where: { id: audioId },
    select: {
      productId: true,
      companyId: true,
      crmLeadId: true,
    },
  });
  if (!audio) return "";

  let productId = audio.productId;

  // AudioFile.productId yo'q bo'lsa, crmLeadId orqali SalesLead'dan derive
  if (!productId && audio.crmLeadId) {
    const sl = await prisma.salesLead.findFirst({
      where: {
        companyId: audio.companyId,
        leadId: Number(audio.crmLeadId),
        productId: { not: null },
      },
      select: { productId: true },
    });
    productId = sl?.productId || null;
    // Topilgan bo'lsa — denormalize qaytarib yozamiz (kelajakda tezroq)
    if (productId) {
      await prisma.audioFile
        .update({ where: { id: audioId }, data: { productId } })
        .catch(() => {});
    }
  }

  if (productId) {
    return await buildProductKnowledge(productId);
  }

  // Fallback — Company.courseInfo
  const company = await prisma.company.findUnique({
    where: { id: audio.companyId },
    select: { courseInfo: true },
  });
  return company?.courseInfo || "";
}

/**
 * Product knowledgeBase + documentlar summary'sini yig'adi.
 * To'liq content emas — token tejash uchun summary/keyPoints/snippet.
 */
export async function buildProductKnowledge(productId: string): Promise<string> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      documents: {
        select: {
          filename: true,
          summary: true,
          keyPoints: true,
          content: true,
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      },
    },
  });
  if (!product) return "";

  const parts: string[] = [];

  parts.push(`=== Mahsulot: ${product.name} ===`);
  if (product.description?.trim()) parts.push(product.description.trim());
  if (product.knowledgeBase?.trim()) parts.push(product.knowledgeBase.trim());

  for (const doc of product.documents) {
    if (doc.summary?.trim()) {
      parts.push(`--- Hujjat: ${doc.filename} ---\n${doc.summary.trim()}`);
      continue;
    }
    if (Array.isArray(doc.keyPoints) && doc.keyPoints.length) {
      const kp = (doc.keyPoints as string[]).join("\n• ");
      parts.push(`--- Hujjat: ${doc.filename} (asosiy nuqtalar) ---\n• ${kp}`);
      continue;
    }
    if (doc.content?.trim()) {
      parts.push(
        `--- Hujjat: ${doc.filename} ---\n${doc.content.trim().slice(0, MAX_DOC_SNIPPET)}`,
      );
    }
  }

  return parts.join("\n\n").slice(0, MAX_PRODUCT_KNOWLEDGE);
}
