import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../utils/prisma", () => ({
  prisma: {
    analysis: { findMany: vi.fn() },
    company: { findUnique: vi.fn() },
  },
}));

import { prisma } from "../../utils/prisma";
import { BenchmarkAgent } from "./benchmark.agent";

const findMany = prisma.analysis.findMany as unknown as ReturnType<typeof vi.fn>;
const findCompany = prisma.company.findUnique as unknown as ReturnType<typeof vi.fn>;

describe("BenchmarkAgent", () => {
  let agent: BenchmarkAgent;

  beforeEach(() => {
    vi.clearAllMocks();
    BenchmarkAgent.clearCache();
    agent = new BenchmarkAgent();
  });

  it("returns empty stats when no analyses exist", async () => {
    findMany.mockResolvedValue([]);
    findCompany.mockResolvedValue({ topPerformerPlaybook: null });

    const result = await agent.execute({ companyId: "c1" }, { companyId: "c1" });

    expect(result.success).toBe(true);
    expect(result.data?.teamStats.totalCalls).toBe(0);
    expect(result.data?.managerPercentiles).toEqual([]);
  });

  it("computes team stats from analyses", async () => {
    findMany.mockResolvedValue([
      {
        overallScore: 80,
        criteria: { Salomlashuv: { score: 90 }, Yakunlash: { score: 50 } },
        errors: [{ type: "Zaif yakunlash" }],
        audioFile: { id: "f1", isSale: true, managerId: "m1", manager: { name: "Ali" } },
      },
      {
        overallScore: 60,
        criteria: { Salomlashuv: { score: 70 }, Yakunlash: { score: 40 } },
        errors: [{ type: "E'tirozga taslim" }],
        audioFile: { id: "f2", isSale: false, managerId: "m2", manager: { name: "Vali" } },
      },
      {
        overallScore: 70,
        criteria: { Salomlashuv: { score: 80 }, Yakunlash: { score: 60 } },
        errors: [],
        audioFile: { id: "f3", isSale: true, managerId: "m1", manager: { name: "Ali" } },
      },
    ]);
    findCompany.mockResolvedValue({ topPerformerPlaybook: { byConversion: { managerId: "m1" } } });

    const result = await agent.execute({ companyId: "c1" }, { companyId: "c1" });

    expect(result.success).toBe(true);
    expect(result.data?.teamStats.totalCalls).toBe(3);
    expect(result.data?.teamStats.totalManagers).toBe(2);
    expect(result.data?.teamStats.avgScore).toBe(70);
    expect(result.data?.managerPercentiles).toHaveLength(2);
    expect(result.data?.managerPercentiles[0].rank).toBe(1);
    expect(result.data?.errorDistribution.length).toBeGreaterThan(0);
  });

  it("caches results within TTL", async () => {
    findMany.mockResolvedValue([]);
    findCompany.mockResolvedValue({ topPerformerPlaybook: null });

    await agent.execute({ companyId: "c1" }, { companyId: "c1" });
    await agent.execute({ companyId: "c1" }, { companyId: "c1" });

    // findMany chaqirildi 1 marta (2-chi chaqiruv cache'dan)
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it("marks top performer errors", async () => {
    findMany.mockResolvedValue([
      {
        overallScore: 90,
        criteria: {},
        errors: [{ type: "Salomlashish xatosi" }],
        audioFile: { id: "f1", isSale: true, managerId: "topper", manager: { name: "Davron" } },
      },
      {
        overallScore: 50,
        criteria: {},
        errors: [{ type: "Salomlashish xatosi" }],
        audioFile: { id: "f2", isSale: false, managerId: "other", manager: { name: "Vali" } },
      },
    ]);
    findCompany.mockResolvedValue({
      topPerformerPlaybook: { byConversion: { managerId: "topper" } },
    });

    const result = await agent.execute({ companyId: "c1" }, { companyId: "c1" });
    const salomError = result.data?.errorDistribution.find((e) => e.type === "Salomlashish xatosi");
    expect(salomError?.topPerformerHasIt).toBe(true);
  });
});
