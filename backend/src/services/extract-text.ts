import { GoogleGenAI } from "@google/genai";
import AdmZip from "adm-zip";

function getAI(): GoogleGenAI {
  return new GoogleGenAI({
    vertexai: true,
    project: process.env.VERTEX_PROJECT || "",
    location: process.env.VERTEX_LOCATION || "us-central1",
  });
}

// PDF dan Gemini Flash orqali matn chiqarish (inline base64)
async function extractPdfWithGemini(buffer: Buffer, filename: string): Promise<string> {
  const ai = getAI();
  const base64Data = buffer.toString("base64");

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType: "application/pdf",
              data: base64Data,
            },
          },
          {
            text: "Extract all text content from this document. Return plain text only, no formatting, no markdown. Preserve paragraph structure with newlines.",
          },
        ],
      },
    ],
  });

  const text = response.candidates?.[0]?.content?.parts?.[0]?.text || "";
  return text.trim();
}

// PPTX dan matn chiqarish — zip ochib slide XML lardan regex bilan
function extractPptxText(buffer: Buffer): string {
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();

  const slideTexts: string[] = [];

  // slide1.xml, slide2.xml ... tartibda saralash
  const slideEntries = entries
    .filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e.entryName))
    .sort((a, b) => {
      const numA = parseInt(a.entryName.match(/(\d+)\.xml$/)?.[1] || "0", 10);
      const numB = parseInt(b.entryName.match(/(\d+)\.xml$/)?.[1] || "0", 10);
      return numA - numB;
    });

  for (const entry of slideEntries) {
    const xmlContent = entry.getData().toString("utf-8");
    // XML teglarini olib tashlab faqat matn qoldiramiz
    const textMatches = xmlContent.match(/<a:t[^>]*>([^<]+)<\/a:t>/g) || [];
    const slideText = textMatches
      .map((m) => m.replace(/<[^>]+>/g, ""))
      .join(" ")
      .trim();
    if (slideText) {
      slideTexts.push(slideText);
    }
  }

  return slideTexts.join("\n\n");
}

// Asosiy funksiya: buffer + fileType dan matn chiqarish
export async function extractTextFromBuffer(
  buffer: Buffer,
  fileType: string,
  filename: string
): Promise<string> {
  switch (fileType.toLowerCase()) {
    case "pdf": {
      return extractPdfWithGemini(buffer, filename);
    }
    case "md":
    case "txt": {
      return buffer.toString("utf-8");
    }
    case "pptx": {
      return extractPptxText(buffer);
    }
    default:
      return buffer.toString("utf-8");
  }
}
