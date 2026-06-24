// Darslik video upload uchun maxsus multer konfiguratsiyasi
// Videolar lokalda `uploads/lessons/` papkasiga saqlanadi.
import multer from "multer";
import * as fs from "fs";
import * as path from "path";
import { Request } from "express";
import { randomUUID } from "crypto";

const LESSON_UPLOAD_DIR =
  process.env.LESSON_UPLOAD_DIR || path.join(process.cwd(), "uploads", "lessons");

if (!fs.existsSync(LESSON_UPLOAD_DIR)) {
  fs.mkdirSync(LESSON_UPLOAD_DIR, { recursive: true });
}

export { LESSON_UPLOAD_DIR };

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, LESSON_UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".mp4";
    cb(null, `${Date.now()}-${randomUUID()}${ext}`);
  },
});

const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
): void => {
  const allowed = [".mp4", ".mov", ".mkv", ".webm", ".m4v"];
  const ext = path.extname(file.originalname).toLowerCase();
  if (file.mimetype.startsWith("video/") || allowed.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error("Faqat video fayllar qabul qilinadi (mp4/mov/mkv/webm)"));
  }
};

// Max 2.5 GB — 2.5 soat video uchun yetarli (H.264 720p)
const MAX_SIZE = 2.5 * 1024 * 1024 * 1024;

export const lessonVideoUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_SIZE },
});
