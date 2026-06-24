import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";

// Prisma va storage mocklari — real DB/Yandex S3 chaqirilmaydi
vi.mock("../utils/custdev-prisma", () => ({
  custdevPrisma: {
    custdev: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    custdevQuestion: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    custdevInterview: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    $transaction: vi.fn(async (calls: any[]) => Promise.all(calls)),
  },
}));

vi.mock("../services/storage", () => ({
  uploadFile: vi.fn(async () => ({
    url: "https://storage.yandexcloud.net/sales-ai-storage/audio/cmp/2026/04/xxx.mp3",
    key: "audio/cmp/2026/04/xxx.mp3",
  })),
}));

vi.mock("../services/custdev-processor", () => ({
  triggerProcessInterview: vi.fn(),
}));

import {
  listCustdevs,
  createCustdev,
  getCustdev,
  addQuestion,
  reorderQuestions,
  uploadInterview,
} from "./custdev.controller";
import { custdevPrisma as prisma } from "../utils/custdev-prisma";
import { triggerProcessInterview } from "../services/custdev-processor";

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    params: {},
    body: {},
    query: {},
    headers: {},
    companyId: "comp-1",
    userRole: "company",
    ...overrides,
  } as unknown as Request;
}

function makeRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response & { status: any; json: any };
}

describe("custdev.controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listCustdevs — kompaniya bo'yicha filter + count qaytaradi", async () => {
    (prisma.custdev.findMany as any).mockResolvedValue([
      {
        id: "c1",
        title: "Pro Sales MVP",
        description: null,
        aiSummary: null,
        createdAt: new Date("2026-04-20"),
        updatedAt: new Date("2026-04-21"),
        _count: { questions: 5, interviews: 3 },
      },
    ]);
    const req = makeReq();
    const res = makeRes();
    await listCustdevs(req, res);
    expect(prisma.custdev.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId: "comp-1" } })
    );
    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(payload.data[0].questionCount).toBe(5);
    expect(payload.data[0].interviewCount).toBe(3);
  });

  it("createCustdev — title majburiy, bo'sh bo'lsa 400", async () => {
    const req = makeReq({ body: { title: "   " } });
    const res = makeRes();
    await createCustdev(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(prisma.custdev.create).not.toHaveBeenCalled();
  });

  it("createCustdev — savollar bilan yaratiladi va sortOrder belgilanadi", async () => {
    (prisma.custdev.create as any).mockResolvedValue({
      id: "c1",
      title: "Mijoz tahlili",
      questions: [
        { id: "q1", text: "Savol 1", sortOrder: 0 },
        { id: "q2", text: "Savol 2", sortOrder: 1 },
      ],
    });
    const req = makeReq({
      body: {
        title: "Mijoz tahlili",
        description: "Test",
        questions: ["Savol 1", " Savol 2", "   "],
      },
    });
    const res = makeRes();
    await createCustdev(req, res);

    const createCall = (prisma.custdev.create as any).mock.calls[0][0];
    expect(createCall.data.companyId).toBe("comp-1");
    expect(createCall.data.title).toBe("Mijoz tahlili");
    expect(createCall.data.questions.create).toEqual([
      { text: "Savol 1", sortOrder: 0 },
      { text: "Savol 2", sortOrder: 1 },
    ]);
  });

  it("getCustdev — boshqa kompaniya Custdev'ini ko'rolmaydi", async () => {
    (prisma.custdev.findFirst as any).mockResolvedValue(null);
    const req = makeReq({ params: { id: "c1" } });
    const res = makeRes();
    await getCustdev(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("addQuestion — sortOrder oldingisi + 1 ga teng bo'ladi", async () => {
    (prisma.custdev.findFirst as any).mockResolvedValue({
      id: "c1",
      companyId: "comp-1",
    });
    (prisma.custdevQuestion.findFirst as any).mockResolvedValue({ sortOrder: 2 });
    (prisma.custdevQuestion.create as any).mockResolvedValue({
      id: "q3",
      text: "Yangi savol",
      sortOrder: 3,
    });

    const req = makeReq({
      params: { id: "c1" },
      body: { text: "Yangi savol" },
    });
    const res = makeRes();
    await addQuestion(req, res);

    const args = (prisma.custdevQuestion.create as any).mock.calls[0][0];
    expect(args.data.sortOrder).toBe(3);
    expect(args.data.text).toBe("Yangi savol");
  });

  it("addQuestion — birinchi savol uchun sortOrder 0", async () => {
    (prisma.custdev.findFirst as any).mockResolvedValue({
      id: "c1",
      companyId: "comp-1",
    });
    (prisma.custdevQuestion.findFirst as any).mockResolvedValue(null); // hali savol yo'q
    (prisma.custdevQuestion.create as any).mockResolvedValue({
      id: "q1",
      text: "Savol",
      sortOrder: 0,
    });

    const req = makeReq({
      params: { id: "c1" },
      body: { text: "Savol" },
    });
    const res = makeRes();
    await addQuestion(req, res);

    const args = (prisma.custdevQuestion.create as any).mock.calls[0][0];
    expect(args.data.sortOrder).toBe(0);
  });

  it("reorderQuestions — noto'g'ri id berilsa 400", async () => {
    (prisma.custdev.findFirst as any).mockResolvedValue({
      id: "c1",
      companyId: "comp-1",
    });
    (prisma.custdevQuestion.findMany as any).mockResolvedValue([
      { id: "q1" },
      { id: "q2" },
    ]);

    const req = makeReq({
      params: { id: "c1" },
      body: { orderedIds: ["q1", "q-FOREIGN"] },
    });
    const res = makeRes();
    await reorderQuestions(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("uploadInterview — fayl yo'q bo'lsa 400 va pipeline chaqirilmaydi", async () => {
    (prisma.custdev.findFirst as any).mockResolvedValue({
      id: "c1",
      companyId: "comp-1",
    });
    const req = makeReq({ params: { id: "c1" } });
    const res = makeRes();
    await uploadInterview(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(triggerProcessInterview).not.toHaveBeenCalled();
  });

  it("uploadInterview — Yandex'ga yuklaydi va background pipeline chaqiradi", async () => {
    (prisma.custdev.findFirst as any).mockResolvedValue({
      id: "c1",
      companyId: "comp-1",
    });
    (prisma.custdevInterview.create as any).mockResolvedValue({
      id: "iv1",
      audioUrl:
        "https://storage.yandexcloud.net/sales-ai-storage/audio/cmp/2026/04/xxx.mp3",
      status: "pending",
    });

    const req = makeReq({ params: { id: "c1" } });
    (req as any).file = {
      buffer: Buffer.from("fake-audio"),
      mimetype: "audio/mpeg",
      originalname: "interview.mp3",
    };
    const res = makeRes();
    await uploadInterview(req, res);

    expect(prisma.custdevInterview.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          custdevId: "c1",
          audioUrl: expect.stringContaining("yandexcloud.net"),
          status: "pending",
        }),
      })
    );
    expect(triggerProcessInterview).toHaveBeenCalledWith("iv1");
    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(payload.data.id).toBe("iv1");
  });
});
