import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

/**
 * Mono audio transkripsiyani Gemini Pro bilan chat formatga o'girish
 */
export const formatMonoTranscription = async (
  rawText: string,
  audioDuration: number
): Promise<string> => {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

    const result = await model.generateContent(
      `Sen professional audio transkripsiya muharririsan.

VAZIFA: Quyidagi xom mono audio transkripsiyani chat formatga o'gir. Audio ${audioDuration} sekund davom etadi.

QOIDALAR:
1. Har bir gapni yangi qatorga yoz: [MM:SS] Speaker: matn
2. Speaker faqat "Menejer", "Mijoz" yoki "Tizim" bo'lsin
3. Suhbat kontekstidan kim gapirayotganini aniqla
4. Vaqtlarni taxminiy qo'y
5. Xom transkripsiyani ILOJI BORICHA O'ZGARTIRMA
6. HECH QANDAY gapni tushirib yuborma
7. Bu Vision School (ingliz tili markazi) sotuvchi va mijoz suhbati

XOM TRANSKRIPSIYA:
${rawText}

FAQAT chat formatdagi natijani qaytar, boshqa hech narsa yozma.`
    );

    return result.response.text().trim();
  } catch (err) {
    console.error("Mono transcription formatting error:", err);
    return rawText;
  }
};
