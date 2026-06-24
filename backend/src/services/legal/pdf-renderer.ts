/**
 * Server-side HTML → PDF renderer (wkhtmltopdf orqali).
 *
 * Strukturali JavobXati'ni Vision letterhead bilan A4 PDF'ga aylantiradi.
 * Output PDF buffer va saqlanmagan vaqtinchalik fayl yo'lini qaytaradi —
 * controller uni LegalCase'ning uploads/legal/<caseId>/ ga ko'chiradi.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawn } from "child_process";
import type { JavobXati } from "./generate-letter";

const LOGO_PATH = path.resolve(process.cwd(), "assets", "vision-logo.png");

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Markdown-vorisly bold (**text** → <strong>) — kichik enhancement, AI matni
// rasmiy holatda ham *muhim* nuqtalarni belgilashi mumkin.
function lightMd(s: string): string {
  return escapeHtml(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br/>");
}

export interface Letterhead {
  brandName: string;
  subtitle: string;
  phone: string;
  address: string;
  inn: string;
  director: string;
}

export function buildLetterHtml(
  letter: JavobXati,
  letterhead: Letterhead,
  opts: { contactPhone?: string } = {},
): string {
  const recipient = (letter.recipient || []).map((r) => lightMd(r)).join("<br/>");
  const sections = (letter.sections || [])
    .map(
      (s) => `
    <h2>${escapeHtml(s.title)}</h2>
    ${(s.paragraphs || []).map((p) => `<p>${lightMd(p)}</p>`).join("\n")}
  `,
    )
    .join("\n");

  const conclusion = letter.conclusion
    ? `
    <h2>${escapeHtml(letter.conclusion.title || "XULOSA")}</h2>
    ${(letter.conclusion.paragraphs || []).map((p) => `<p>${lightMd(p)}</p>`).join("\n")}
  `
    : "";

  const attachments =
    letter.attachments && letter.attachments.length
      ? `
    <h2>Ilova qilingan dalillar</h2>
    <ul class="attach">
      ${letter.attachments.map((a) => `<li>${lightMd(a)}</li>`).join("\n")}
    </ul>
  `
      : "";

  const refLine = letter.refNumber
    ? `<div class="reference">${lightMd(letter.refNumber)}</div>`
    : "";

  const ijroPhone = opts.contactPhone || letterhead.phone;

  // Logo'ni base64 qilib embed qilamiz — wkhtmltopdf'da file:// ham ishlaydi,
  // lekin base64 portativroq.
  const logoData = fs.existsSync(LOGO_PATH)
    ? `data:image/png;base64,${fs.readFileSync(LOGO_PATH).toString("base64")}`
    : "";

  return `<!doctype html>
<html lang="uz"><head><meta charset="utf-8"/>
<title>${escapeHtml(letter.title || "Javob xati")}</title>
<style>
  @page { size: A4; margin: 18mm 22mm 20mm 22mm; }
  body { font-family: "DejaVu Serif", "Liberation Serif", "Times New Roman", serif;
         font-size: 12pt; color: #111; line-height: 1.55; margin: 0; }
  .letterhead { border-bottom: 2.5pt solid #111; padding-bottom: 10px; margin-bottom: 14px; }
  .letterhead-row { width: 100%; border-collapse: collapse; }
  .letterhead-row td { vertical-align: middle; padding: 0; }
  .logo-cell { width: 130px; padding-right: 14px !important; }
  .logo-cell img { width: 120px; height: auto; display: block; }
  .brand-cell { text-align: left; }
  .brand-name { font-family: "DejaVu Sans", "Liberation Sans", Arial, sans-serif;
                font-size: 18pt; font-weight: 700; letter-spacing: 0.5px; color: #111; margin: 0; }
  .brand-tagline { font-family: "DejaVu Sans", "Liberation Sans", Arial, sans-serif;
                   font-size: 9.5pt; color: #555; margin-top: 3px; letter-spacing: 0.3px; }
  .legal-line { font-family: "DejaVu Sans", "Liberation Sans", Arial, sans-serif;
                font-size: 8.5pt; color: #555; margin-top: 6px; }
  .rekv { font-family: "DejaVu Sans", "Liberation Sans", Arial, sans-serif;
          font-size: 8.5pt; color: #555; margin-top: 8px; line-height: 1.4; text-align: left; }
  .rekv .sep { color: #999; padding: 0 4px; }
  .meta-row { width: 100%; margin: 14px 0 18px 0; font-size: 10.5pt; border-collapse: collapse; }
  .meta-row td { padding: 0; vertical-align: top; }
  .meta-left { text-align: left; }
  .meta-right { text-align: right; }
  .addressee { text-align: right; font-size: 11pt; margin: 0 0 16px 0; line-height: 1.5; }
  .addressee .label { color: #555; font-style: italic; font-size: 10pt; }
  .reference { text-align: right; font-size: 10.5pt; color: #333; margin: 0 0 22px 0; font-style: italic; }
  h1.title { text-align: center; font-family: "DejaVu Sans", "Liberation Sans", Arial, sans-serif;
             font-size: 16pt; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase;
             margin: 8px 0 6px 0; }
  .subj { text-align: center; font-size: 11pt; margin-bottom: 18px; font-style: italic; }
  h2 { font-family: "DejaVu Sans", "Liberation Sans", Arial, sans-serif; font-size: 11pt;
       text-transform: uppercase; letter-spacing: 0.6px; border-bottom: 1px solid #888;
       padding-bottom: 3px; margin: 16px 0 10px 0; color: #111; }
  p { margin: 7px 0; text-align: justify; }
  ul.attach { padding-left: 20px; margin: 6px 0; }
  ul.attach li { margin-bottom: 4px; text-align: left; }
  .closing { margin-top: 22px; }
  .signature-block { margin-top: 16px; width: 100%; border-collapse: collapse; }
  .signature-block td { vertical-align: top; padding: 0; font-size: 11pt; }
  .sign-position { line-height: 1.5; }
  .sign-line { display: inline-block; min-width: 180px; border-bottom: 1px solid #111;
               margin: 0 6px; height: 1em; }
  .stamp-area { margin-top: 28px; font-size: 10pt; color: #555; }
  .small { font-size: 9.5pt; color: #555; }
  .ijro { margin-top: 24px; font-size: 9.5pt; color: #444; line-height: 1.4; }
</style></head><body>

<div class="letterhead">
  <table class="letterhead-row"><tr>
    ${logoData ? `<td class="logo-cell"><img src="${logoData}" alt="Vision"/></td>` : ""}
    <td class="brand-cell">
      <div class="brand-name">${escapeHtml(letterhead.brandName)}</div>
      <div class="brand-tagline">${escapeHtml(letterhead.subtitle)}</div>
    </td>
  </tr></table>
  <div class="rekv">
    ${escapeHtml(letterhead.address)}
    <span class="sep">•</span> STIR: ${escapeHtml(letterhead.inn)}
    <span class="sep">•</span> Tel: ${escapeHtml(letterhead.phone)}
  </div>
</div>

<table class="meta-row"><tr>
  <td class="meta-left">Chiquvchi raqami: № _____ /${new Date().getFullYear()}</td>
  <td class="meta-right">${escapeHtml(letter.city || "Toshkent shahri")}, ${escapeHtml(letter.date || "")}</td>
</tr></table>

${recipient ? `<div class="addressee"><span class="label">Kimga:</span><br/>${recipient}</div>` : ""}
${refLine}

<h1 class="title">${escapeHtml(letter.title || "Javob xati")}</h1>
${letter.intro ? `<p>${lightMd(letter.intro)}</p>` : ""}

${sections}

${conclusion}

${attachments}

<div class="closing">
  <p>Hurmat va ehtirom bilan,</p>
  <table class="signature-block"><tr>
    <td>
      <div class="sign-position">
        <strong>${escapeHtml(letter.signature?.role || letterhead.brandName + " rahbari")}</strong><br/>
      </div>
    </td>
    <td style="text-align: right; padding-left: 16px;">
      <div>
        <span class="sign-line"></span><br/>
        <span class="small">${escapeHtml(letter.signature?.name || letterhead.director)} &nbsp;/&nbsp; imzo</span>
      </div>
    </td>
  </tr></table>
  <div class="stamp-area">M.O. (muhr o'rni)</div>
  <div class="ijro">
    <strong>Ijrochi:</strong> Mijozlar bilan ishlash bo'limi<br/>
    <strong>Aloqa:</strong> ${escapeHtml(ijroPhone)}
  </div>
</div>

</body></html>`;
}

export async function renderLetterPdf(
  letter: JavobXati,
  letterhead: Letterhead,
  opts: { contactPhone?: string } = {},
): Promise<Buffer> {
  const html = buildLetterHtml(letter, letterhead, opts);
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "legal-pdf-"));
  const htmlPath = path.join(tmpDir, "letter.html");
  const pdfPath = path.join(tmpDir, "letter.pdf");
  try {
    await fs.promises.writeFile(htmlPath, html, "utf8");
    await new Promise<void>((resolve, reject) => {
      const p = spawn(
        "wkhtmltopdf",
        [
          "--quiet",
          "--encoding",
          "utf-8",
          "--page-size",
          "A4",
          "--margin-top",
          "18mm",
          "--margin-right",
          "22mm",
          "--margin-bottom",
          "20mm",
          "--margin-left",
          "22mm",
          "--enable-local-file-access",
          htmlPath,
          pdfPath,
        ],
        { stdio: ["ignore", "ignore", "pipe"] },
      );
      let err = "";
      p.stderr.on("data", (d) => {
        err += d.toString();
      });
      p.on("error", reject);
      p.on("close", (code) =>
        code === 0
          ? resolve()
          : reject(new Error(`wkhtmltopdf exit ${code}: ${err.slice(-500)}`)),
      );
    });
    return await fs.promises.readFile(pdfPath);
  } finally {
    fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

// Letter ni Markdown ko'rinishida ham qaytaradi — UI'da preview / re-edit uchun
export function letterToMarkdown(
  letter: JavobXati,
  letterhead: Letterhead,
): string {
  const lines: string[] = [];
  lines.push(`# ${letter.title || "Javob xati"}`);
  lines.push("");
  lines.push(`**${letterhead.brandName}** — ${letterhead.subtitle}`);
  lines.push(`${letterhead.address} • STIR: ${letterhead.inn} • Tel: ${letterhead.phone}`);
  lines.push("");
  lines.push(`📅 ${letter.city || ""}, ${letter.date || ""}`);
  if (letter.recipient?.length) {
    lines.push("");
    lines.push("**Kimga:**");
    for (const r of letter.recipient) lines.push(`- ${r}`);
  }
  if (letter.refNumber) {
    lines.push("");
    lines.push(`*${letter.refNumber}*`);
  }
  if (letter.intro) {
    lines.push("");
    lines.push(letter.intro);
  }
  for (const s of letter.sections || []) {
    lines.push("");
    lines.push(`## ${s.title}`);
    for (const p of s.paragraphs || []) lines.push(p);
  }
  if (letter.conclusion) {
    lines.push("");
    lines.push(`## ${letter.conclusion.title || "XULOSA"}`);
    for (const p of letter.conclusion.paragraphs || []) lines.push(p);
  }
  if (letter.attachments?.length) {
    lines.push("");
    lines.push("## Ilova");
    for (const a of letter.attachments) lines.push(`- ${a}`);
  }
  lines.push("");
  lines.push(
    `**${letter.signature?.role || letterhead.brandName + " rahbari"}** — ${letter.signature?.name || letterhead.director}`,
  );
  return lines.join("\n");
}
