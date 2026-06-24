/**
 * Yuridik AI (Smart-Advokat) controllers — V1.
 *
 * Faqat company owner ko'radi (userRole === "company"). ROP/manager => 403.
 */

import type { Request, Response } from "express";
import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";
import { prisma } from "../utils/prisma";
import { success, error } from "../utils/response";
import { runChat } from "../services/legal/chat-engine";
import { parseAttachment } from "../services/legal/attachment-parser";
import { extractTextFromFile } from "../services/legal/file-extractor";
import { parseClientInfo } from "../services/legal/parse-client-info";
import { generateLetter } from "../services/legal/generate-letter";
import { editLetter } from "../services/legal/edit-letter";
import { renderLetterPdf, letterToMarkdown } from "../services/legal/pdf-renderer";
import { transcribeBufferDeferred } from "../services/yandex-stt-deferred";

const UPLOAD_ROOT = path.resolve(process.cwd(), "uploads", "legal");
const KNOWLEDGE_ROOT = path.resolve(process.cwd(), "uploads", "legal-knowledge");

const ensureOwner = (req: Request, res: Response): boolean => {
  if (req.userRole !== "company") {
    error(res, "Faqat kompaniya egasi ko'ra oladi", 403);
    return false;
  }
  return true;
};

// ─── Cases ──────────────────────────────────────────────────────────────

export const listCases = async (req: Request, res: Response): Promise<void> => {
  if (!ensureOwner(req, res)) return;
  try {
    const companyId = req.companyId!;
    const cases = await prisma.legalCase.findMany({
      where: { companyId },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        status: true,
        clientName: true,
        clientPhone: true,
        authority: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { messages: true, attachments: true, evidence: true } },
      },
    });
    success(res, cases);
  } catch (err) {
    console.error("listCases error:", err);
    error(res, "Keyslarni olishda xatolik");
  }
};

export const createCase = async (req: Request, res: Response): Promise<void> => {
  if (!ensureOwner(req, res)) return;
  try {
    const companyId = req.companyId!;
    const { title, clientName, clientPhone, authority, rawText } = req.body as {
      title?: string;
      clientName?: string;
      clientPhone?: string;
      authority?: string;
      rawText?: string;
    };

    let finalTitle = title?.trim() || "";
    let finalClientName = clientName?.trim() || null;
    let finalClientPhone = clientPhone?.trim() || null;
    let finalAuthority = authority?.trim() || null;

    // Erkin matn berilgan — Flash bilan parse qil
    if (rawText && rawText.trim()) {
      try {
        const parsed = await parseClientInfo(rawText.trim());
        if (!finalTitle) finalTitle = parsed.title;
        if (!finalClientName) finalClientName = parsed.clientName || null;
        if (!finalClientPhone) finalClientPhone = parsed.clientPhone || null;
        if (!finalAuthority) finalAuthority = parsed.authority || null;
      } catch (e) {
        console.error("[parseClientInfo] error:", (e as Error).message);
        if (!finalTitle) {
          const firstLine =
            rawText.split("\n").find((l) => l.trim()) || "Yangi keys";
          finalTitle = firstLine.trim().slice(0, 80);
        }
      }
    }

    if (!finalTitle) {
      error(res, "Keys sarlavhasi yoki erkin matn kerak", 400);
      return;
    }

    const created = await prisma.legalCase.create({
      data: {
        companyId,
        title: finalTitle,
        clientName: finalClientName,
        clientPhone: finalClientPhone,
        authority: finalAuthority,
      },
    });

    // rawText'ni birinchi user xabari sifatida saqlash — chat AI to'liq
    // kontekstni ko'radi (raqam, ism, manager, kurs ma'lumotlari va h.k.)
    if (rawText && rawText.trim()) {
      await prisma.legalMessage.create({
        data: {
          caseId: created.id,
          role: "user",
          content: rawText.trim(),
        },
      });
    }

    success(res, created, 201);
  } catch (err) {
    console.error("createCase error:", err);
    error(res, "Keys yaratishda xatolik");
  }
};

export const getCase = async (req: Request, res: Response): Promise<void> => {
  if (!ensureOwner(req, res)) return;
  try {
    const companyId = req.companyId!;
    const { id } = req.params;
    const c = await prisma.legalCase.findFirst({
      where: { id, companyId },
    });
    if (!c) {
      error(res, "Keys topilmadi", 404);
      return;
    }
    const [messages, attachments, evidence] = await Promise.all([
      prisma.legalMessage.findMany({
        where: { caseId: id },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.legalAttachment.findMany({
        where: { caseId: id },
        orderBy: { createdAt: "desc" },
      }),
      prisma.legalEvidence.findMany({
        where: { caseId: id },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    messages.reverse();
    success(res, { case: c, messages, attachments, evidence });
  } catch (err) {
    console.error("getCase error:", err);
    error(res, "Keysni olishda xatolik");
  }
};

export const deleteCase = async (req: Request, res: Response): Promise<void> => {
  if (!ensureOwner(req, res)) return;
  try {
    const companyId = req.companyId!;
    const { id } = req.params;
    const c = await prisma.legalCase.findFirst({
      where: { id, companyId },
      select: { id: true },
    });
    if (!c) {
      error(res, "Keys topilmadi", 404);
      return;
    }
    await prisma.legalCase.delete({ where: { id } });
    // Best-effort fayl tozalash
    try {
      const dir = path.join(UPLOAD_ROOT, id);
      if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    } catch (_) {
      /* ignore */
    }
    success(res, { ok: true });
  } catch (err) {
    console.error("deleteCase error:", err);
    error(res, "O'chirishda xatolik");
  }
};

// ─── Messages ───────────────────────────────────────────────────────────

export const postMessage = async (req: Request, res: Response): Promise<void> => {
  if (!ensureOwner(req, res)) return;
  try {
    const companyId = req.companyId!;
    const { id } = req.params;
    const { content, attachmentIds } = req.body as {
      content?: string;
      attachmentIds?: string[];
    };
    if (!content || !content.trim()) {
      error(res, "Xabar matni kerak", 400);
      return;
    }
    const c = await prisma.legalCase.findFirst({
      where: { id, companyId },
      select: { id: true },
    });
    if (!c) {
      error(res, "Keys topilmadi", 404);
      return;
    }
    const result = await runChat({
      caseId: id,
      companyId,
      userMessage: content.trim(),
      attachmentIds: Array.isArray(attachmentIds) ? attachmentIds : [],
    });
    success(res, result);
  } catch (err) {
    console.error("postMessage error:", err);
    error(res, `AI bilan suhbat xatosi: ${(err as Error).message}`);
  }
};

// ─── Javob xati generator ───────────────────────────────────────────────

export const postGenerateLetter = async (
  req: Request,
  res: Response,
): Promise<void> => {
  if (!ensureOwner(req, res)) return;
  try {
    const companyId = req.companyId!;
    const { id } = req.params;
    const result = await generateLetter(id, companyId);
    success(res, result);
  } catch (err) {
    console.error("postGenerateLetter error:", err);
    error(res, `Javob xatini yaratishda xato: ${(err as Error).message}`);
  }
};

// ─── Avtomatik tahlil + PDF render ──────────────────────────────────────
// 3 qadamli avtomat oqim:
//   1. Mijoz arizasi (LegalAttachment kind=client-claim) — allaqachon yuklangan;
//   2. Bizning dalillar (kind=our-evidence + crm audio'lar) — generateLetter
//      ichida getAudiosByPhone tool bilan avtomat yig'iladi;
//   3. Strukturali xat → wkhtmltopdf orqali Vision letterhead bilan PDF.
// Natija LegalCase.letterDraft (Markdown) + letterPdfUrl da saqlanadi.
export const postAnalyzeAndRender = async (
  req: Request,
  res: Response,
): Promise<void> => {
  if (!ensureOwner(req, res)) return;
  try {
    const companyId = req.companyId!;
    const { id } = req.params;
    const c = await prisma.legalCase.findFirst({
      where: { id, companyId },
      select: { id: true },
    });
    if (!c) {
      error(res, "Keys topilmadi", 404);
      return;
    }

    // 1+2+3-bosqich: tahlil + xat tuzish (existing pipeline)
    const { letter, letterhead } = await generateLetter(id, companyId);

    // 4-bosqich: PDF render
    const pdfBuf = await renderLetterPdf(letter, letterhead);

    // Saqlash
    const dir = path.join(UPLOAD_ROOT, id);
    fs.mkdirSync(dir, { recursive: true });
    const fname = `letter-${Date.now()}.pdf`;
    const fullPath = path.join(dir, fname);
    fs.writeFileSync(fullPath, pdfBuf);
    const pdfUrl = `/uploads/legal/${id}/${fname}`;

    // LegalCase'ga yozish
    const md = letterToMarkdown(letter, letterhead);
    await prisma.legalCase.update({
      where: { id },
      data: { letterDraft: md, letterPdfUrl: pdfUrl, status: "in-progress" },
    });

    // Chat'ga ham xulosa sifatida yozib qo'yamiz — tarix uchun
    await prisma.legalMessage.create({
      data: {
        caseId: id,
        role: "assistant",
        content: `## 🪄 Avtomatik tahlil yakunlandi\n\n${md}\n\n📄 [Javob xati PDF](${pdfUrl})`,
      },
    });

    success(res, { letter, letterhead, letterDraft: md, letterPdfUrl: pdfUrl });
  } catch (err) {
    console.error("postAnalyzeAndRender error:", err);
    error(res, `Tahlil/PDF xatosi: ${(err as Error).message}`);
  }
};

// ─── Mavjud xatga MINIMAL EDIT qo'llash + PDF qayta render ─────────────
// Foydalanuvchi xatdagi bitta joyni o'zgartirmoqchi bo'lsa (telefon, ism,
// recipient va h.k.) — butun xat qaytadan tuzilmaydi. Mavjud letterDraft
// asos bo'lib, faqat instruction'da aytilgan farqlar qo'llaniladi.
//
// Body: { instruction: string, attachmentId?: string }
//   instruction — "shu nomerni 95 510 15 15 ga o'zgartir" kabi matn.
//   attachmentId — agar foydalanuvchi rasm yuklagan bo'lsa, OCR matni o'qiladi.
export const postEditLetter = async (
  req: Request,
  res: Response,
): Promise<void> => {
  if (!ensureOwner(req, res)) return;
  try {
    const companyId = req.companyId!;
    const { id } = req.params;
    const { instruction, attachmentId } = req.body as {
      instruction?: string;
      attachmentId?: string;
    };
    if (!instruction || !instruction.trim()) {
      error(res, "Tahrir instruksiyasi kerak", 400);
      return;
    }
    const c = await prisma.legalCase.findFirst({
      where: { id, companyId },
      select: { id: true, letterDraft: true },
    });
    if (!c) {
      error(res, "Keys topilmadi", 404);
      return;
    }
    if (!c.letterDraft) {
      error(
        res,
        "Hech qanday xat hali generatsiya qilinmagan. Avval \"Avtomatik tahlil\" tugmasini bosing.",
        400,
      );
      return;
    }

    let attachmentText: string | undefined;
    if (attachmentId) {
      const att = await prisma.legalAttachment.findFirst({
        where: { id: attachmentId, caseId: id },
        select: { extractedText: true },
      });
      attachmentText = att?.extractedText || undefined;
    }

    const { letter, changes } = await editLetter({
      caseId: id,
      companyId,
      instruction: instruction.trim(),
      attachmentText,
    });

    // Vision letterhead — generate-letter.ts'dagi konstanta bilan bir xil bo'lishi
    // uchun xuddi o'sha yo'nalishda PDF render qilamiz.
    const letterhead = {
      brandName: "Vision School",
      subtitle:
        "IELTS & English Mastery Academy — \"Vision Academy\" NTM (eski nomi — \"D SH SH ZIYO\" NTM)",
      phone: "+998 95 510 15 15",
      address:
        "Toshkent shahar, Olmazor tumani, Farobiy tor Dutorchi ko'chasi, 9-D uy",
      inn: "305719452",
      director: "Sh. Quvondiqov",
    };

    const pdfBuf = await renderLetterPdf(letter, letterhead);
    const dir = path.join(UPLOAD_ROOT, id);
    fs.mkdirSync(dir, { recursive: true });
    const fname = `letter-${Date.now()}.pdf`;
    fs.writeFileSync(path.join(dir, fname), pdfBuf);
    const pdfUrl = `/uploads/legal/${id}/${fname}`;

    const md = letterToMarkdown(letter, letterhead);
    await prisma.legalCase.update({
      where: { id },
      data: { letterDraft: md, letterPdfUrl: pdfUrl },
    });

    // Chat'ga ham yozib qo'yamiz — "nima o'zgardi" ro'yxati bilan
    await prisma.legalMessage.create({
      data: {
        caseId: id,
        role: "assistant",
        content: `## ✏️ Xat tahrirlandi\n\n**Instruksiya:** ${instruction.trim()}\n\n**O'zgarishlar:**\n${
          changes.length ? changes.map((ch) => `- ${ch}`).join("\n") : "- (aniq o'zgarish ro'yxati AI tomonidan qaytarilmadi)"
        }\n\n📄 [Yangilangan PDF](${pdfUrl})`,
      },
    });

    success(res, { letter, letterhead, letterDraft: md, letterPdfUrl: pdfUrl, changes });
  } catch (err) {
    console.error("postEditLetter error:", err);
    error(res, `Tahrir xatosi: ${(err as Error).message}`);
  }
};

// ─── Attachments ────────────────────────────────────────────────────────

export const postAttachment = async (
  req: Request,
  res: Response,
): Promise<void> => {
  if (!ensureOwner(req, res)) return;
  try {
    const companyId = req.companyId!;
    const { id } = req.params;
    const c = await prisma.legalCase.findFirst({
      where: { id, companyId },
      select: { id: true },
    });
    if (!c) {
      error(res, "Keys topilmadi", 404);
      return;
    }

    const file = req.file;
    if (!file) {
      error(res, "Fayl yuborilmadi", 400);
      return;
    }

    const dir = path.join(UPLOAD_ROOT, id);
    fs.mkdirSync(dir, { recursive: true });
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    const fileId = randomUUID();
    const fname = `${fileId}-${safeName}`;
    const fullPath = path.join(dir, fname);
    fs.writeFileSync(fullPath, file.buffer);

    const fileUrl = `/uploads/legal/${id}/${fname}`;

    // Parse: txt/md/docx/pptx native, pdf/image — Gemini Flash
    let extractedText: string | null = null;
    try {
      const parsed = await parseAttachment(
        fullPath,
        file.mimetype,
        companyId,
        file.originalname,
      );
      extractedText = parsed.text;
    } catch (e) {
      console.error("[legal/parseAttachment] error:", (e as Error).message);
    }

    // kind: "client-claim" | "our-evidence" | "contract" | "other" — frontend'dan
    // multipart formData orqali kelishi mumkin. Yo'q bo'lsa null.
    const rawKind = (req.body as { kind?: string } | undefined)?.kind;
    const kind =
      rawKind && ["client-claim", "our-evidence", "contract", "other"].includes(rawKind)
        ? rawKind
        : null;

    const att = await prisma.legalAttachment.create({
      data: {
        caseId: id,
        filename: file.originalname,
        mimeType: file.mimetype,
        fileUrl,
        size: file.size,
        extractedText,
        kind,
      },
    });

    // Evidence yozish
    if (extractedText && extractedText.trim().length > 0) {
      await prisma.legalEvidence.create({
        data: {
          caseId: id,
          type: "attachment",
          source: att.id,
          summary: `${file.originalname}: ${extractedText.slice(0, 300)}`,
          rawData: { attachmentId: att.id },
        },
      });
    }

    success(res, att, 201);
  } catch (err) {
    console.error("postAttachment error:", err);
    error(res, "Fayl yuklashda xatolik");
  }
};

export const streamAttachment = async (
  req: Request,
  res: Response,
): Promise<void> => {
  if (!ensureOwner(req, res)) return;
  try {
    const companyId = req.companyId!;
    const { id } = req.params;
    const att = await prisma.legalAttachment.findUnique({
      where: { id },
      include: { case: { select: { companyId: true } } },
    });
    if (!att || att.case.companyId !== companyId) {
      error(res, "Topilmadi", 404);
      return;
    }
    const rel = att.fileUrl.replace(/^\/uploads\//, "");
    const fullPath = path.resolve(process.cwd(), "uploads", rel);
    if (!fullPath.startsWith(path.resolve(process.cwd(), "uploads"))) {
      error(res, "Yo'l noto'g'ri", 400);
      return;
    }
    if (!fs.existsSync(fullPath)) {
      error(res, "Fayl topilmadi", 404);
      return;
    }
    res.setHeader("Content-Type", att.mimeType || "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(att.filename)}"`,
    );
    fs.createReadStream(fullPath).pipe(res);
  } catch (err) {
    console.error("streamAttachment error:", err);
    error(res, "Faylni olishda xatolik");
  }
};

// ─── Voice → text (Yandex STT) ──────────────────────────────────────────

export const postVoiceTranscribe = async (
  req: Request,
  res: Response,
): Promise<void> => {
  if (!ensureOwner(req, res)) return;
  try {
    const file = req.file;
    if (!file) {
      error(res, "Audio yuborilmadi", 400);
      return;
    }
    const ext =
      file.originalname.split(".").pop()?.toLowerCase() ||
      (file.mimetype.includes("webm")
        ? "webm"
        : file.mimetype.includes("ogg")
          ? "ogg"
          : "wav");
    const lines = await transcribeBufferDeferred(file.buffer, ext, {
      maxAttempts: 60, // ~5 minut max — qisqa voice xabarlar uchun
      intervalMs: 3000,
    });
    const text = lines.map((l) => l.text).join(" ").trim();
    success(res, { text });
  } catch (err) {
    console.error("postVoiceTranscribe error:", err);
    error(res, `STT xatolik: ${(err as Error).message}`);
  }
};

// ─── Knowledge ──────────────────────────────────────────────────────────

export const listKnowledge = async (
  req: Request,
  res: Response,
): Promise<void> => {
  if (!ensureOwner(req, res)) return;
  try {
    const companyId = req.companyId!;
    const items = await prisma.legalKnowledge.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
    });
    success(res, items);
  } catch (err) {
    console.error("listKnowledge error:", err);
    error(res, "Bazani olishda xatolik");
  }
};

export const createKnowledge = async (
  req: Request,
  res: Response,
): Promise<void> => {
  if (!ensureOwner(req, res)) return;
  try {
    const companyId = req.companyId!;
    const { title, category, content } = req.body as {
      title?: string;
      category?: string;
      content?: string;
    };
    const file = req.file;

    if (!title?.trim() || !category?.trim()) {
      error(res, "title va category kerak", 400);
      return;
    }

    let finalContent = (content || "").trim();
    let fileUrl: string | null = null;

    if (file) {
      // Faylni saqlash
      fs.mkdirSync(KNOWLEDGE_ROOT, { recursive: true });
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      const fileId = randomUUID();
      const fname = `${fileId}-${safeName}`;
      const fullPath = path.join(KNOWLEDGE_ROOT, fname);
      fs.writeFileSync(fullPath, file.buffer);
      fileUrl = `/uploads/legal-knowledge/${fname}`;

      // Matnni chiqarish (txt/md/docx/pptx native, pdf/rasm Flash)
      try {
        const r = await extractTextFromFile(
          file.buffer,
          file.mimetype,
          file.originalname,
        );
        const extracted = r.text.trim();
        finalContent = extracted
          ? finalContent
            ? `${finalContent}\n\n--- ${file.originalname} ---\n${extracted}`
            : extracted
          : finalContent;
      } catch (e) {
        console.error("[legal/knowledge extract] error:", (e as Error).message);
      }
    }

    if (!finalContent) {
      error(res, "Matn yoki fayl kerak", 400);
      return;
    }

    const created = await prisma.legalKnowledge.create({
      data: {
        companyId,
        title: title.trim(),
        category: category.trim(),
        content: finalContent,
        fileUrl,
      },
    });
    success(res, created, 201);
  } catch (err) {
    console.error("createKnowledge error:", err);
    error(res, "Bazaga yozishda xatolik");
  }
};

export const deleteKnowledge = async (
  req: Request,
  res: Response,
): Promise<void> => {
  if (!ensureOwner(req, res)) return;
  try {
    const companyId = req.companyId!;
    const { id } = req.params;
    const k = await prisma.legalKnowledge.findFirst({
      where: { id, companyId },
      select: { id: true },
    });
    if (!k) {
      error(res, "Topilmadi", 404);
      return;
    }
    await prisma.legalKnowledge.delete({ where: { id } });
    success(res, { ok: true });
  } catch (err) {
    console.error("deleteKnowledge error:", err);
    error(res, "O'chirishda xatolik");
  }
};
