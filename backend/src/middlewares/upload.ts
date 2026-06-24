import multer from "multer";
import { Request } from "express";

const storage = multer.memoryStorage();

const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
): void => {
  if (file.mimetype.startsWith("audio/")) {
    cb(null, true);
  } else {
    cb(new Error("Faqat audio fayllar qabul qilinadi"));
  }
};

export const upload = multer({
  storage,
  fileFilter,
  // Audio limit olib tashlangan — imtihon suhbati cheklanmagan vaqt davom etishi mumkin
  limits: {
    fileSize: Number.MAX_SAFE_INTEGER,
  },
});
