import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../utils/prisma", () => ({
  prisma: {
    analysis: { findMany: vi.fn() },
    goldenMoment: { findMany: vi.fn(), createMany: vi.fn() },
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
import { PatternMinerAgent } from "./pattern-miner.agent";

const findMany = prisma.analysis.findMany as unknown as ReturnType<typeof vi.fn>;
const findExisting = prisma.goldenMoment.findMany as unknown as ReturnType<typeof vi.fn>;
const createMany = prisma.goldenMoment.createMany as unknown as ReturnType<typeof vi.fn>;

const longTranscript = Array.from({ length: 20 })
  .map((_, i) => `[0${i}:00] Menejer: yetarlicha uzun gap bo'lsin bu qatorda ham`)
  .join("\n");

describe("PatternMinerAgent", () => {
  let agent: PatternMinerAgent;

  beforeEach(() => {
    vi.clearAllMocks();
    agent = new PatternMinerAgent();
  });

  it("returns empty when no analyses found", async () => {
    findMany.mockResolvedValue([]);
    findExisting.mockResolvedValue([]);

    const result = await agent.execute(
      { managerId: "m1", companyId: "c1" },
      { companyId: "c1" },
    );

    expect(result.success).toBe(true);
    expect(result.data?.moments).toEqual([]);
    expect(result.data?.callsAnalyzed).toBe(0);
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it("skips short transcriptions", async () => {
    findMany.mockResolvedValue([
      {
        id: "a1",
        overallScore: 80,
        winPoints: [],
        coachingInsights: null,
        audioFile: { id: "f1", transcription: "qisqa", isSale: true },
      },
    ]);
    findExisting.mockResolvedValue([]);

    const result = await agent.execute(
      { managerId: "m1", companyId: "c1" },
      { companyId: "c1" },
    );

    expect(result.success).toBe(true);
    expect(result.data?.moments).toEqual([]);
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it("stores golden moments that pass quality filter", async () => {
    findMany.mockResolvedValue([
      {
        id: "a1",
        overallScore: 85,
        winPoints: [],
        coachingInsights: null,
        audioFile: { id: "f1", transcription: longTranscript, isSale: true },
      },
    ]);
    findExisting.mockResolvedValue([]);

    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify({
        goldenMoments: [
          {
            timestamp: "02:45",
            technique: "Value-First Pricing",
            quote: "Biz sizga 2.5M so'm emas, balki bolangizning kelajagini sotayapmiz",
            whyItWorked: "Mijoz darhol chegirma so'ramay qiymat haqida savol berdi",
            replicable: true,
          },
        ],
      }),
    });

    const result = await agent.execute(
      { managerId: "m1", companyId: "c1" },
      { companyId: "c1" },
    );

    expect(result.success).toBe(true);
    expect(result.data?.moments).toHaveLength(1);
    expect(result.data?.moments[0].technique).toBe("Value-First Pricing");
    expect(createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          managerId: "m1",
          companyId: "c1",
          audioFileId: "f1",
          timestamp: "02:45",
        }),
      ]),
    });
  });

  it("rejects nonsensical technique names", async () => {
    findMany.mockResolvedValue([
      {
        id: "a1",
        overallScore: 85,
        winPoints: [],
        coachingInsights: null,
        audioFile: { id: "f1", transcription: longTranscript, isSale: true },
      },
    ]);
    findExisting.mockResolvedValue([]);

    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify({
        goldenMoments: [
          {
            timestamp: "01:00",
            technique: "PayLater PlayMarket download",
            quote: "PayLater PlayMarket orqali yuklab oling shu narsa ishlaydi",
            whyItWorked: "texnik yechim",
            replicable: true,
          },
        ],
      }),
    });

    const result = await agent.execute(
      { managerId: "m1", companyId: "c1" },
      { companyId: "c1" },
    );

    expect(result.success).toBe(true);
    expect(result.data?.moments).toHaveLength(0);
    expect(createMany).not.toHaveBeenCalled();
  });

  it("deduplicates against existing golden moments", async () => {
    findMany.mockResolvedValue([
      {
        id: "a1",
        overallScore: 85,
        winPoints: [],
        coachingInsights: null,
        audioFile: { id: "f1", transcription: longTranscript, isSale: true },
      },
    ]);
    findExisting.mockResolvedValue([
      { audioFileId: "f1", timestamp: "02:45" },
    ]);

    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify({
        goldenMoments: [
          {
            timestamp: "02:45",
            technique: "Value Pricing",
            quote: "Uzun iqtibos bu yerda mijoz qiymat haqida savol bermoqda",
            whyItWorked: "ishladi chunki qiymat ko'rsatildi",
            replicable: true,
          },
        ],
      }),
    });

    const result = await agent.execute(
      { managerId: "m1", companyId: "c1" },
      { companyId: "c1" },
    );

    expect(result.success).toBe(true);
    expect(result.data?.moments).toHaveLength(0);
    expect(createMany).not.toHaveBeenCalled();
  });

  it("handles malformed JSON gracefully", async () => {
    findMany.mockResolvedValue([
      {
        id: "a1",
        overallScore: 85,
        winPoints: [],
        coachingInsights: null,
        audioFile: { id: "f1", transcription: longTranscript, isSale: true },
      },
    ]);
    findExisting.mockResolvedValue([]);

    mockGenerateContent.mockResolvedValue({ text: "not valid json {{" });

    const result = await agent.execute(
      { managerId: "m1", companyId: "c1" },
      { companyId: "c1" },
    );

    expect(result.success).toBe(true);
    expect(result.data?.moments).toHaveLength(0);
  });
});
