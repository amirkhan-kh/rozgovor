import dotenv from "dotenv";
dotenv.config();

import { execSync } from "child_process";
import { writeFileSync, readFileSync, unlinkSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import { tmpdir } from "os";
import { prisma } from "./utils/prisma";
import { getFileBuffer, getKeyFromUrl } from "./services/storage";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

const transcribeWithModel = async (
  audioBuffer: Buffer,
  model: string
): Promise<{ text: string; inputTokens: number; outputTokens: number; timeMs: number }> => {
  const base64Audio = audioBuffer.toString("base64");
  const start = Date.now();

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: "audio/mp3", data: base64Audio } },
            { text: `Bu audio O'zbek tilida telefon suhbati. Audioni diqqat bilan tinglab transkripsiya qil.
FORMAT: [MM:SS] Menejer: gap yoki [MM:SS] Mijoz: gap
Agar suhbat bo'lmasa: "SUHBAT YO'Q"
Faqat eshitilgan gaplarni yoz, o'ylab gap to'qima!` },
          ],
        }],
        generationConfig: { temperature: 0, maxOutputTokens: 8000 },
      }),
    }
  );

  const timeMs = Date.now() - start;
  const data = (await response.json()) as any;
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const inputTokens = data.usageMetadata?.promptTokenCount || 0;
  const outputTokens = data.usageMetadata?.candidatesTokenCount || 0;

  return { text, inputTokens, outputTokens, timeMs };
};

async function main() {
  // Qisqa audio olish (test uchun) - birinchi 60 sekundini kesib olamiz
  const audioFile = await prisma.audioFile.findUnique({
    where: { id: "cmnj6n66p00qlmyz9kbc65255" },
  });
  if (!audioFile) { console.log("Audio topilmadi"); return; }

  const key = getKeyFromUrl(audioFile.fileUrl);
  const fullBuffer = await getFileBuffer(key);

  // 60 sekundlik qismlini kesib olamiz
  const tmpInput = join(tmpdir(), `compare_${randomUUID()}.mp3`);
  const tmpOutput = join(tmpdir(), `compare_short_${randomUUID()}.mp3`);
  writeFileSync(tmpInput, fullBuffer);
  execSync(`ffmpeg -y -i "${tmpInput}" -t 60 -ar 16000 -ac 1 "${tmpOutput}" 2>/dev/null`, { timeout: 30000 });
  const shortBuffer = readFileSync(tmpOutput);
  try { unlinkSync(tmpInput); unlinkSync(tmpOutput); } catch {}

  console.log(`Audio: ${audioFile.fileName} (birinchi 60 sekund)\n`);

  // Flash test
  console.log("--- GEMINI 2.5 FLASH ---");
  const flash = await transcribeWithModel(shortBuffer, "gemini-2.5-flash");
  console.log(`Vaqt: ${flash.timeMs}ms (${(flash.timeMs / 1000).toFixed(1)}s)`);
  console.log(`Input tokens: ${flash.inputTokens}`);
  console.log(`Output tokens: ${flash.outputTokens}`);
  console.log(`Natija:\n${flash.text.substring(0, 500)}\n`);

  // Pro test
  console.log("--- GEMINI 2.5 PRO ---");
  const pro = await transcribeWithModel(shortBuffer, "gemini-2.5-pro");
  console.log(`Vaqt: ${pro.timeMs}ms (${(pro.timeMs / 1000).toFixed(1)}s)`);
  console.log(`Input tokens: ${pro.inputTokens}`);
  console.log(`Output tokens: ${pro.outputTokens}`);
  console.log(`Natija:\n${pro.text.substring(0, 500)}\n`);

  // Hisob-kitob (484 ta audio, o'rtacha 153 sek)
  console.log("=========================================");
  console.log("  484 TA AUDIO UCHUN HISOB-KITOB");
  console.log("=========================================\n");

  const avgInputFlash = flash.inputTokens;
  const avgOutputFlash = flash.outputTokens;
  const avgInputPro = pro.inputTokens;
  const avgOutputPro = pro.outputTokens;

  // Flash narxlari (per 1M tokens)
  const flashInputPrice = 0.15;
  const flashOutputPrice = 0.60;
  // Pro narxlari
  const proInputPrice = 1.25;
  const proOutputPrice = 10.0;

  const flashTotalInput = (avgInputFlash * 484) / 1_000_000;
  const flashTotalOutput = (avgOutputFlash * 484) / 1_000_000;
  const flashCost = flashTotalInput * flashInputPrice + flashTotalOutput * flashOutputPrice;
  const flashTime = (flash.timeMs * 484) / 1000 / 60; // daqiqa

  const proTotalInput = (avgInputPro * 484) / 1_000_000;
  const proTotalOutput = (avgOutputPro * 484) / 1_000_000;
  const proCost = proTotalInput * proInputPrice + proTotalOutput * proOutputPrice;
  const proTime = (pro.timeMs * 484) / 1000 / 60; // daqiqa

  console.log(`${"".padEnd(20)} ${"FLASH".padEnd(20)} ${"PRO".padEnd(20)}`);
  console.log("-".repeat(60));
  console.log(`${"Tezlik (1 audio)".padEnd(20)} ${(flash.timeMs / 1000).toFixed(1) + "s".padEnd(19)} ${(pro.timeMs / 1000).toFixed(1) + "s"}`);
  console.log(`${"484 ta uchun vaqt".padEnd(20)} ${flashTime.toFixed(0) + " daqiqa".padEnd(19)} ${proTime.toFixed(0) + " daqiqa"}`);
  console.log(`${"Narx (Gemini)".padEnd(20)} ${"$" + flashCost.toFixed(2).padEnd(19)} ${"$" + proCost.toFixed(2)}`);
  console.log(`${"+ Claude tahlil".padEnd(20)} ${"~$12".padEnd(20)} ${"~$12"}`);
  console.log(`${"JAMI NARX".padEnd(20)} ${"~$" + (flashCost + 12).toFixed(0).padEnd(19)} ${"~$" + (proCost + 12).toFixed(0)}`);
  console.log(`${"Aniqlik".padEnd(20)} ${"Yaxshi".padEnd(20)} ${"Juda yaxshi"}`);
  console.log(`${"Gallyutsinatsiya".padEnd(20)} ${"Ba'zan bor".padEnd(20)} ${"Deyarli yo'q"}`);
  console.log(`${"Rollar aniqligi".padEnd(20)} ${"O'rtacha".padEnd(20)} ${"Yuqori"}`);

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
