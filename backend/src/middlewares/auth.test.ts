import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";

vi.mock("../utils/prisma", () => ({
  prisma: {
    company: { findUnique: vi.fn() },
    manager: { findUnique: vi.fn() },
  },
}));

vi.mock("../utils/jwt", () => ({
  verifyToken: vi.fn(),
}));

import { authMiddleware } from "./auth";
import { prisma } from "../utils/prisma";
import { verifyToken } from "../utils/jwt";

function makeReq(headers: Record<string, string> = {}, query: Record<string, string> = {}): Request {
  return { headers, query } as unknown as Request;
}

function makeRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response & { status: any; json: any };
}

const next: NextFunction = vi.fn();

describe("authMiddleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("token yo'q bo'lsa 401 qaytaradi", async () => {
    const req = makeReq();
    const res = makeRes();
    await authMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("noto'g'ri token uchun 401 qaytaradi", async () => {
    (verifyToken as any).mockImplementation(() => {
      throw new Error("invalid");
    });
    const req = makeReq({ authorization: "Bearer bad-token" });
    const res = makeRes();
    await authMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("company token uchun companyId va userRole o'rnatadi", async () => {
    (verifyToken as any).mockReturnValue({ id: "comp-1", role: "company" });
    (prisma.company.findUnique as any).mockResolvedValue({ id: "comp-1" });

    const req = makeReq({ authorization: "Bearer good-token" });
    const res = makeRes();
    await authMiddleware(req, res, next);

    expect(req.companyId).toBe("comp-1");
    expect(req.userRole).toBe("company");
    expect(next).toHaveBeenCalled();
  });

  it("manager token uchun managerId, companyId, role o'rnatadi", async () => {
    (verifyToken as any).mockReturnValue({ id: "mgr-1", role: "manager" });
    (prisma.manager.findUnique as any).mockResolvedValue({
      id: "mgr-1",
      companyId: "comp-1",
      isActive: true,
      company: { id: "comp-1" },
    });

    const req = makeReq({ authorization: "Bearer mgr-token" });
    const res = makeRes();
    await authMiddleware(req, res, next);

    expect(req.managerId).toBe("mgr-1");
    expect(req.companyId).toBe("comp-1");
    expect(req.userRole).toBe("manager");
    expect(next).toHaveBeenCalled();
  });

  it("inactive manager uchun 403 qaytaradi", async () => {
    (verifyToken as any).mockReturnValue({ id: "mgr-1", role: "manager" });
    (prisma.manager.findUnique as any).mockResolvedValue({
      id: "mgr-1",
      companyId: "comp-1",
      isActive: false,
      company: { id: "comp-1" },
    });

    const req = makeReq({ authorization: "Bearer mgr-token" });
    const res = makeRes();
    await authMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("topilmagan company uchun 401 qaytaradi", async () => {
    (verifyToken as any).mockReturnValue({ id: "ghost", role: "company" });
    (prisma.company.findUnique as any).mockResolvedValue(null);

    const req = makeReq({ authorization: "Bearer t" });
    const res = makeRes();
    await authMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("query parametrida token qabul qiladi", async () => {
    (verifyToken as any).mockReturnValue({ id: "comp-1", role: "company" });
    (prisma.company.findUnique as any).mockResolvedValue({ id: "comp-1" });

    const req = makeReq({}, { token: "from-query" });
    const res = makeRes();
    await authMiddleware(req, res, next);
    expect(verifyToken).toHaveBeenCalledWith("from-query");
    expect(next).toHaveBeenCalled();
  });
});
