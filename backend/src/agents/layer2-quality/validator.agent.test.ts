/**
 * Validator Agent unit testlari.
 *
 * Prisma va GoogleGenAI mocklanadi — testlar DB yoki network urilmaydi.
 * Yangi tuzilma: Validator har item uchun alohida Flash chaqiruvini qiladi,
 * shuning uchun mockResolvedValueOnce() per-item zanjiri ishlatiladi.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../utils/prisma", () => ({
  prisma: {
    analysis: {
      findUnique: vi.fn(),
    },
    cleanedAnalysis: {
      upsert: vi.fn().mockResolvedValue({}),
    },
  },
}));

const { mockGenerateContent } = vi.hoisted(() => ({
  mockGenerateContent: vi.fn(),
}));
vi.mock("@google/genai", () => {
  class FakeGoogleGenAI {
    models = { generateContent: mockGenerateContent };
  }
  return { GoogleGenAI: FakeGoogleGenAI };
});

import { prisma } from "../../utils/prisma";
import { ValidatorAgent } from "./validator.agent";

const findUnique = prisma.analysis.findUnique as unknown as ReturnType<typeof vi.fn>;
const upsert = prisma.cleanedAnalysis.upsert as unknown as ReturnType<typeof vi.fn>;

// Sample transcription — timestamp 05:40 (zaif yakun) va 02:52 (callback) ni
// ko'zda tutadigan yetarli kontekst bilan.
const sampleTranscription = `[00:05] Menejer: Assalomu alaykum, [brand]
[00:12] Mijoz: Ha eshitaman
[00:20] Menejer: Sizga yangi kursimiz haqida ma'lumot bermoqchiman
[00:35] Mijoz: Eshitaman
[01:00] Menejer: Bu biznes inglizchasi kursi
[01:30] Mijoz: Qiziq
[02:00] Menejer: Narxi 2.5 million so'm
[02:30] Mijoz: Vaqtim yo'q hozir
[02:45] Mijoz: soat 8 da qayta qo'ng'iroq qiling
[02:52] Menejer: Xo'p, soat 8 da qayta qo'ng'iroq qilaman
[03:00] Mijoz: Raxmat
[04:00] Menejer: Kursimiz juda zo'r
[05:00] Mijoz: Men o'ylab ko'raman
[05:30] Mijoz: Qimmat ekan menga
[05:35] Menejer: Mayli, o'ylab ko'ring
[05:40] Menejer: Xayr
[06:00] Mijoz: Xayr`;

describe("ValidatorAgent", () => {
  let agent: ValidatorAgent;

  beforeEach(() => {
    vi.clearAllMocks();
    agent = new ValidatorAgent();
  });

  it("returns empty output when transcription is missing", async () => {
    findUnique.mockResolvedValue({
      id: "a1",
      errors: [{ type: "test" }],
      coachingInsights: null,
      audioFile: { transcription: "" },
    });

    const result = await agent.execute({ analysisId: "a1" }, { companyId: "c1" });

    expect(result.success).toBe(true);
    expect(result.data?.cleanedErrors).toEqual([]);
    expect(result.data?.confidenceScore).toBe(100);
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it("returns empty output when there are no errors or moments", async () => {
    findUnique.mockResolvedValue({
      id: "a1",
      errors: [],
      coachingInsights: { criticalMoments: [] },
      audioFile: { transcription: sampleTranscription },
    });

    const result = await agent.execute({ analysisId: "a1" }, { companyId: "c1" });

    expect(result.success).toBe(true);
    expect(result.data?.cleanedErrors).toEqual([]);
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it("validates each error separately with its own snippet", async () => {
    findUnique.mockResolvedValue({
      id: "a1",
      errors: [
        { type: "Zaif yakunlash", description: "Open ending", timestamp: "05:40" },
        { type: "E'tirozga taslim", description: "Taslim bo'ldi", timestamp: "02:52" },
      ],
      coachingInsights: { criticalMoments: [] },
      audioFile: { transcription: sampleTranscription },
    });

    // Har item alohida chaqiriq qiladi — mockResolvedValueOnce zanjiri
    mockGenerateContent
      .mockResolvedValueOnce({
        text: JSON.stringify({
          confidence: 90,
          quote: "Mayli, o'ylab ko'ring",
          reason: "Haqiqatan zaif yakun — menejer chora ko'rmasdan tugatdi",
        }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          confidence: 10,
          quote: "soat 8 da qayta qo'ng'iroq qilaman",
          reason: "Bu callback kelishuvi, surrender emas",
        }),
      });

    const result = await agent.execute({ analysisId: "a1" }, { companyId: "c1" });

    expect(result.success).toBe(true);
    expect(mockGenerateContent).toHaveBeenCalledTimes(2); // har item uchun alohida
    expect(result.data?.cleanedErrors).toHaveLength(1);
    expect(result.data?.cleanedErrors[0].type).toBe("Zaif yakunlash");
    expect(result.data?.rejectedItems).toHaveLength(1);
    expect(result.data?.rejectedItems[0].reason).toContain("callback");

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { analysisId: "a1" } }),
    );
  });

  it("averages confidence across errors and moments", async () => {
    findUnique.mockResolvedValue({
      id: "a1",
      errors: [
        { type: "E1", timestamp: "00:05" },
        { type: "E2", timestamp: "01:00" },
      ],
      coachingInsights: {
        criticalMoments: [
          { timestamp: "02:00" },
          { timestamp: "04:00" },
        ],
      },
      audioFile: { transcription: sampleTranscription },
    });

    mockGenerateContent
      .mockResolvedValueOnce({
        text: JSON.stringify({ confidence: 100, quote: "q1", reason: "r1" }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({ confidence: 80, quote: "q2", reason: "r2" }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({ confidence: 60, quote: "q3", reason: "r3" }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({ confidence: 40, quote: "q4", reason: "r4" }),
      });

    const result = await agent.execute({ analysisId: "a1" }, { companyId: "c1" });

    // (100 + 80 + 60 + 40) / 4 = 70
    expect(result.data?.confidenceScore).toBe(70);
    expect(result.data?.cleanedErrors).toHaveLength(2); // 100, 80 >= 70
    expect(result.data?.cleanedMoments).toHaveLength(0); // 60, 40 < 70
    expect(mockGenerateContent).toHaveBeenCalledTimes(4);
  });

  it("rejects item when snippet cannot be extracted", async () => {
    findUnique.mockResolvedValue({
      id: "a1",
      errors: [{ type: "E1", timestamp: "99:99" }], // transkriptda bunday vaqt yo'q
      coachingInsights: null,
      audioFile: { transcription: sampleTranscription },
    });

    const result = await agent.execute({ analysisId: "a1" }, { companyId: "c1" });

    expect(result.success).toBe(true);
    expect(result.data?.cleanedErrors).toHaveLength(0);
    expect(result.data?.rejectedItems).toHaveLength(1);
    expect(result.data?.rejectedItems[0].reason).toContain("snippet");
    // Snippet yo'q bo'lgani uchun Flash chaqiruvi qilinmaydi
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it("handles malformed JSON response gracefully", async () => {
    findUnique.mockResolvedValue({
      id: "a1",
      errors: [{ type: "E1", timestamp: "05:40" }],
      coachingInsights: null,
      audioFile: { transcription: sampleTranscription },
    });

    mockGenerateContent.mockResolvedValue({ text: "this is not json{{{" });

    const result = await agent.execute({ analysisId: "a1" }, { companyId: "c1" });

    expect(result.success).toBe(true);
    expect(result.data?.cleanedErrors).toHaveLength(0); // confidence=0 bo'ldi
  });

  it("strips markdown code fences from response", async () => {
    findUnique.mockResolvedValue({
      id: "a1",
      errors: [{ type: "E1", timestamp: "05:40" }],
      coachingInsights: null,
      audioFile: { transcription: sampleTranscription },
    });

    mockGenerateContent.mockResolvedValue({
      text:
        "```json\n" +
        JSON.stringify({ confidence: 85, quote: "test quote", reason: "ok" }) +
        "\n```",
    });

    const result = await agent.execute({ analysisId: "a1" }, { companyId: "c1" });

    expect(result.success).toBe(true);
    expect(result.data?.cleanedErrors).toHaveLength(1);
  });

  it("fails gracefully when analysis not found", async () => {
    findUnique.mockResolvedValue(null);

    const result = await agent.execute({ analysisId: "missing" }, { companyId: "c1" });

    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("respects feature flag env var", async () => {
    process.env.AGENT_VALIDATOR_ENABLED = "false";
    const result = await agent.execute({ analysisId: "a1" }, { companyId: "c1" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("disabled");
    delete process.env.AGENT_VALIDATOR_ENABLED;
  });
});
