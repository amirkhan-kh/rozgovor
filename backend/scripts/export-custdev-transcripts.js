const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");
const { PrismaClient } = require("@prisma/client");
const dotenv = require("dotenv");

dotenv.config();

function makeClient(url) {
  return new PrismaClient({
    datasources: {
      db: { url },
    },
  });
}

function pickDbUrl() {
  return (
    process.env.CUSTDEV_DATABASE_URL ||
    process.env.DATABASE_URL ||
    "postgresql://salesai:salesai123@localhost:5432/salesai"
  );
}

function sanitizeSheetName(name) {
  const cleaned = String(name || "Interview")
    .replace(/[\\/?*[\]:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, 31) || "Interview";
}

function parseTranscript(transcription) {
  if (!transcription) return [];

  const lines = String(transcription)
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const turns = [];

  for (const line of lines) {
    const text = line.replace(/^\[\d{2}:\d{2}\]\s*/, "").trim();
    if (!text) continue;
    turns.push(text);
  }

  return turns;
}

function classifyTurn(text, prevSpeaker = "operator") {
  const lower = text.toLowerCase();

  const operatorPhrases = [
    "qo'ng'iroq qilyapman",
    "qong'iroq qilyapman",
    "telefon qilayotgan",
    "sifat va nazorat",
    "suhbatimiz",
    "so'rovnoma",
    "so'rovnomamiz",
    "savollarimiz",
    "savol ber",
    "savol",
    "vaucher",
    "bizning klinikamiz",
    "xizmatimiz",
    "mijozlarimiz",
    "mijoz bilan",
    "qo'shimcha",
    "rahbarimiz",
    "registraturadagi",
    "kelib davolanib ketgan",
    "kelib davolangan",
    "murojaat qilgan",
    "baholay olasizmi",
    "qanaqa baho",
    "qanchalik",
    "nimaga aynan",
    "qayerdan ma'lumot",
    "qaysi klinikaga",
    "konsultatsiyaga kelib",
    "qatnashsangiz",
    "bepul vaucher",
    "bir martalik",
    "so'rovnomadan maqsad",
    "xizmat sifatimiz",
    "xizmat sifatimizni",
    "aniqlashdan iborat",
    "kamchilik",
    "taklif",
    "baho berasizmi",
    "konsultatsiya qanchalik",
    "registraturadagi qizlarimiz",
  ];

  const customerPhrases = [
    "men ",
    "man ",
    "menga",
    "menda",
    "bizda",
    "o'zim",
    "oyijon",
    "opa",
    "uka",
    "belim",
    "oyog'im",
    "muammom",
    "muammo",
    "borganimda",
    "davolandim",
    "borolmadim",
    "kelomayapti",
    "pul",
    "qimmat",
    "yaxshi",
    "yo'q",
    "borib",
    "kelib ketdim",
    "kelganman",
    "borardim",
  ];

  let operatorScore = 0;
  let customerScore = 0;

  for (const kw of operatorPhrases) if (lower.includes(kw)) operatorScore += 2;
  for (const kw of customerPhrases) if (lower.includes(kw)) customerScore += 1;

  if (/\?$/.test(text)) operatorScore += 2;
  if (/^(aha|ha|yo'q|yoq|hm|hmm|mayli|xo'p|hop)\b/i.test(lower)) customerScore += 1;
  if (/^(assalomu alaykum|allo|salom|yaxshimisiz|charchamayapsizmi)\b/i.test(lower)) operatorScore += 2;

  if (/\b(men|man)\b/i.test(lower) && /\b(davolandim|borolmadim|kelganman|o'zim|menda|menga)\b/i.test(lower)) {
    customerScore += 2;
  }
  if (/\b(qanaqa|qanday|nima|nega|qayerdan|qachon|qanchalik|kimdan)\b/i.test(lower) && !/\b(men|man)\b/i.test(lower)) {
    operatorScore += 1;
  }

  if (operatorScore > customerScore) return "operator";
  if (customerScore > operatorScore) return "customer";

  const startsWithOperator = /^(allo|assalomu alaykum|salom|yaxshimisiz|charchamayapsizmi|ismim|aloqaga chiq|telefon qil|qo'ng'iroq qil)/i.test(lower);
  if (startsWithOperator) return "operator";

  const startsWithCustomer = /^(aha|ha|yo'q|yoq|men|man|menda|menga|bizda|o'zim|opa|aka)/i.test(lower);
  if (startsWithCustomer) return "customer";

  return prevSpeaker === "operator" ? "customer" : "operator";
}

function buildRows(transcription) {
  const turns = parseTranscript(transcription);
  const rows = [];
  let prevSpeaker = "operator";

  for (const text of turns) {
    const speaker = classifyTurn(text, prevSpeaker);
    rows.push({
      customer: speaker === "customer" ? text : null,
      operator: speaker === "operator" ? text : null,
    });
    prevSpeaker = speaker;
  }

  return rows;
}

async function main() {
  const inputUrl = pickDbUrl();
  const outputPath =
    process.argv[2] ||
    path.resolve(process.cwd(), "../../Bexruz Cust Dev _ Transcripts.xlsx");

  const prisma = makeClient(inputUrl);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "SalesAI";
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.company = "SalesAI";

  try {
    const interviews = await prisma.custdevInterview.findMany({
      where: { transcription: { not: null } },
      select: {
        id: true,
        status: true,
        transcription: true,
        audioUrl: true,
        custdev: {
          select: {
            title: true,
            company: { select: { name: true } },
          },
        },
      },
      orderBy: { id: "asc" },
    });

    console.log(`[export] found ${interviews.length} interviews`);

    for (const [idx, interview] of interviews.entries()) {
      const sheetName = sanitizeSheetName(
        `${idx + 1}. ${interview.custdev?.title || "Custdev"}`
      );
      const ws = workbook.addWorksheet(sheetName);
      ws.getColumn(1).width = 60;
      ws.getColumn(2).width = 60;

      ws.getCell("A1").value = `Kompaniya: ${interview.custdev?.company?.name || ""}`;
      ws.getCell("B1").value = `Status: ${interview.status}`;
      ws.getCell("A2").value = `Custdev: ${interview.custdev?.title || ""}`;
      ws.getCell("B2").value = `Interview: ${interview.id}`;
      ws.getCell("A3").value = `Audio: ${interview.audioUrl || ""}`;
      ws.getCell("B3").value = `Sheet: ${sheetName}`;

      ws.getRow(1).font = { bold: true };
      ws.getRow(2).font = { bold: true };
      ws.getRow(3).font = { italic: true };

      const rows = buildRows(interview.transcription || "");
      let rowNumber = 5;

      ws.getCell(`A4`).value = "A mijoz";
      ws.getCell(`B4`).value = "B opretor";
      ws.getRow(4).font = { bold: true };

      for (const row of rows) {
        ws.getCell(`A${rowNumber}`).value = row.customer || "";
        ws.getCell(`B${rowNumber}`).value = row.operator || "";
        ws.getCell(`A${rowNumber}`).alignment = { wrapText: true, vertical: "top" };
        ws.getCell(`B${rowNumber}`).alignment = { wrapText: true, vertical: "top" };
        rowNumber += 1;
      }

      ws.views = [{ state: "frozen", ySplit: 4 }];
      ws.eachRow((row) => {
        row.alignment = { wrapText: true, vertical: "top" };
      });
    }

    await workbook.xlsx.writeFile(outputPath);
    console.log(`[export] saved: ${outputPath}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[export] FATAL:", err?.stack || err?.message || err);
  process.exit(1);
});
