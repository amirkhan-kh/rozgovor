import { describe, it, expect, vi } from "vitest";
import type { Response } from "express";
import { success, error } from "./response";

function makeRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response & { status: any; json: any };
}

describe("response helpers", () => {
  it("success default 200 status va data o'rab beradi", () => {
    const res = makeRes();
    success(res, { id: 1 });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { id: 1 } });
  });

  it("success custom status'ni qabul qiladi", () => {
    const res = makeRes();
    success(res, { ok: true }, 201);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("error default 500 status va message qaytaradi", () => {
    const res = makeRes();
    error(res, "ichki xato");
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: "ichki xato" });
  });

  it("error 400 status'ni qabul qiladi", () => {
    const res = makeRes();
    error(res, "yomon so'rov", 400);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
