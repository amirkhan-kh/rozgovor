/**
 * LegalAttachment uchun fayl → matn.
 * file-extractor.ts'ni ishlatadi (txt/md/docx/pptx native, pdf/rasm Flash).
 */

import * as fs from "fs";
import { extractTextFromFile } from "./file-extractor";

export interface ParsedAttachment {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export async function parseAttachment(
  filePath: string,
  mimeType: string,
  _companyId?: string,
  filename?: string,
): Promise<ParsedAttachment> {
  const buffer = fs.readFileSync(filePath);
  const name = filename || filePath.split("/").pop() || "file";
  const r = await extractTextFromFile(buffer, mimeType, name);
  // TODO: LegalCost jadvali yaratilganda companyId bilan yozish.
  return {
    text: r.text,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
  };
}
