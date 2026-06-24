import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { signToken, verifyToken } from "./jwt";

const ORIGINAL_SECRET = process.env.JWT_SECRET;

describe("jwt utilities", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = "test-secret-not-real";
  });

  afterEach(() => {
    if (ORIGINAL_SECRET) process.env.JWT_SECRET = ORIGINAL_SECRET;
    else delete process.env.JWT_SECRET;
  });

  it("token yaratib, qayta verify qila olishi kerak", () => {
    const token = signToken("user-123", "company");
    const decoded = verifyToken(token);
    expect(decoded.id).toBe("user-123");
    expect(decoded.role).toBe("company");
  });

  it("default role 'company' bo'lishi kerak", () => {
    const token = signToken("user-456");
    const decoded = verifyToken(token);
    expect(decoded.role).toBe("company");
  });

  it("manager role saqlanishi kerak", () => {
    const token = signToken("mgr-1", "manager");
    expect(verifyToken(token).role).toBe("manager");
  });

  it("noto'g'ri token uchun xato beradi", () => {
    expect(() => verifyToken("invalid.token.here")).toThrow();
  });

  it("JWT_SECRET yo'q bo'lsa xato beradi", () => {
    delete process.env.JWT_SECRET;
    expect(() => signToken("x")).toThrow("JWT_SECRET is not defined");
  });
});
