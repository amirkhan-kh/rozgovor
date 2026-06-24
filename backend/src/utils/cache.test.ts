import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { cache } from "./cache";

describe("cache utility", () => {
  beforeEach(() => {
    cache.clear();
  });

  it("set + get bilan ma'lumot saqlash va olish", () => {
    cache.set("key1", { name: "test" });
    expect(cache.get("key1")).toEqual({ name: "test" });
  });

  it("mavjud bo'lmagan kalit null qaytaradi", () => {
    expect(cache.get("yo'q")).toBeNull();
  });

  it("delete kalitni o'chirishi kerak", () => {
    cache.set("k", "v");
    cache.delete("k");
    expect(cache.get("k")).toBeNull();
  });

  it("clear barcha kalitlarni o'chiradi", () => {
    cache.set("a", 1);
    cache.set("b", 2);
    cache.clear();
    expect(cache.get("a")).toBeNull();
    expect(cache.get("b")).toBeNull();
  });

  it("TTL tugagandan keyin null qaytaradi", () => {
    vi.useFakeTimers();
    cache.set("temp", "data", 1000);
    expect(cache.get("temp")).toBe("data");
    vi.advanceTimersByTime(1500);
    expect(cache.get("temp")).toBeNull();
    vi.useRealTimers();
  });

  it("default TTL 5 daqiqa", () => {
    vi.useFakeTimers();
    cache.set("d", "x");
    vi.advanceTimersByTime(4 * 60 * 1000);
    expect(cache.get("d")).toBe("x");
    vi.advanceTimersByTime(2 * 60 * 1000);
    expect(cache.get("d")).toBeNull();
    vi.useRealTimers();
  });

  it("turli typedagi qiymatlarni saqlay oladi", () => {
    cache.set("num", 42);
    cache.set("arr", [1, 2, 3]);
    cache.set("obj", { nested: { v: true } });
    expect(cache.get<number>("num")).toBe(42);
    expect(cache.get<number[]>("arr")).toEqual([1, 2, 3]);
    expect(cache.get<{ nested: { v: boolean } }>("obj")).toEqual({ nested: { v: true } });
  });

  afterEach(() => {
    cache.clear();
  });
});
