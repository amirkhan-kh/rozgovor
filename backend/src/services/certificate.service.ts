// Certificate PDF generator.
// Template: assets/sertifikat-template.pdf (A4 landscape 842×595pt)
// Only the recipient name changes — overlays white rect then draws new name.
//
// Coord reference (pdftotext screen coords → pdf-lib bottom-left):
//   Cursive name: screen yMin=253 yMax=311, x 93–438
//   In pdf-lib (bottom): y 284–342, x 93–438
import { PDFDocument, rgb } from 'pdf-lib';
import * as fs from 'fs';
import * as path from 'path';

const TEMPLATE_PATH = path.join(__dirname, '../../assets/sertifikat-template.pdf');
const FONT_PATH     = path.join(__dirname, '../../assets/fonts/Allura.ttf');

let _fontBytes: Buffer | null = null;
function loadFontBytes(): Buffer {
  if (!_fontBytes) _fontBytes = fs.readFileSync(FONT_PATH);
  return _fontBytes;
}

export async function generateCertificate(recipientName: string): Promise<Uint8Array> {
  const templateBytes = fs.readFileSync(TEMPLATE_PATH);
  const pdfDoc = await PDFDocument.load(templateBytes);

  // Register fontkit for custom font embedding
  const fontkit = require('@pdf-lib/fontkit');
  pdfDoc.registerFontkit(fontkit);

  const page    = pdfDoc.getPages()[0];
  const { width, height } = page.getSize(); // ~842 × 595.5

  const fontBytes = loadFontBytes();
  const scriptFont = await pdfDoc.embedFont(fontBytes);

  // ── 1. White rectangle covering original placeholder name ─────────────────
  // Original text (from pdftotext): x 92–438, screen y 253–311
  // pdf-lib y (from bottom) = height - screen_y
  //   bottom of text area: height - 311 = 284.5  → use 278 with margin
  //   top   of text area: height - 253 = 342.5  → use 352 with margin
  page.drawRectangle({
    x:      78,
    y:      276,
    width:  390,
    height: 78,         // 276 → 354 from bottom
    color:  rgb(1, 1, 1),
  });

  // ── 2. Draw new name in Dancing Script ────────────────────────────────────
  const fontSize = 52;
  // Baseline positioned to vertically center within the covered area
  const nameY = 302;   // ~302pt from bottom
  const nameX = 92;

  page.drawText(recipientName, {
    x:    nameX,
    y:    nameY,
    size: fontSize,
    font: scriptFont,
    color: rgb(0.06, 0.06, 0.16),
  });

  // ── 3. Underline ─────────────────────────────────────────────────────────
  const nameWidthPt = scriptFont.widthOfTextAtSize(recipientName, fontSize);
  const lineY = 284;
  page.drawLine({
    start: { x: nameX,              y: lineY },
    end:   { x: nameX + Math.min(nameWidthPt, 420), y: lineY },
    thickness: 1.2,
    color: rgb(0.12, 0.12, 0.22),
  });

  return pdfDoc.save();
}
