import { describe, it, expect } from "vitest";
import { autoFixSwappedRoles } from "./call-transcriber";

type Seg = { speaker: string; text: string; start: number };

describe("autoFixSwappedRoles — Menejer↔Mijoz swap detection", () => {
  it("'ismim Visola' client'da bo'lsa rollarni almashtiradi", () => {
    const segs: Seg[] = [
      { speaker: "client", text: "Alo", start: 18 },
      { speaker: "manager", text: "Assalomu alaykum", start: 18 },
      {
        speaker: "client",
        text: "Xo'p, ismim Visola. Xursandman tanishganimdan",
        start: 36,
      },
      { speaker: "manager", text: "Aha, shunaqa", start: 42 },
    ];
    const fixed = autoFixSwappedRoles(segs, "Visola Ergasheva", "test.mp3");
    expect(fixed[0].speaker).toBe("manager"); // edi client, swap
    expect(fixed[1].speaker).toBe("client"); // edi manager, swap
    expect(fixed[2].speaker).toBe("manager");
    expect(fixed[3].speaker).toBe("client");
  });

  it("rol to'g'ri belgilangan bo'lsa o'zgarmaydi", () => {
    const segs: Seg[] = [
      { speaker: "client", text: "Alo", start: 18 },
      {
        speaker: "manager",
        text: "Assalomu alaykum, ismim Visola",
        start: 18,
      },
      { speaker: "client", text: "Ha, eshityapman", start: 25 },
    ];
    const fixed = autoFixSwappedRoles(segs, "Visola", "test.mp3");
    expect(fixed[0].speaker).toBe("client");
    expect(fixed[1].speaker).toBe("manager");
    expect(fixed[2].speaker).toBe("client");
  });

  it("manager nomi bo'sh bo'lsa hech narsa qilmaydi", () => {
    const segs: Seg[] = [
      { speaker: "client", text: "ismim Visola", start: 0 },
    ];
    const fixed = autoFixSwappedRoles(segs, "", "test.mp3");
    expect(fixed[0].speaker).toBe("client");
  });

  it("system segmentlar tegmaydi", () => {
    const segs: Seg[] = [
      { speaker: "system", text: "(jiringlash)", start: 0 },
      { speaker: "client", text: "ismim Aziza", start: 5 },
      { speaker: "manager", text: "kompaniya nomi", start: 10 },
    ];
    const fixed = autoFixSwappedRoles(segs, "Aziza Tursunova", "test.mp3");
    expect(fixed[0].speaker).toBe("system");
    expect(fixed[1].speaker).toBe("manager"); // swap
    expect(fixed[2].speaker).toBe("client");
  });

  it("Pattern: '{firstName} kompaniyalaridan' ham aniqlaydi", () => {
    const segs: Seg[] = [
      {
        speaker: "client",
        text: "Sarvar Zaynitdinov kompaniyalaridan telefon qilayotgandim",
        start: 24,
      },
      { speaker: "manager", text: "Aha, shunaqa", start: 30 },
    ];
    const fixed = autoFixSwappedRoles(segs, "Sarvar Zaynitdinov", "test.mp3");
    expect(fixed[0].speaker).toBe("manager"); // pattern matches Sarvar
    expect(fixed[1].speaker).toBe("client");
  });

  it("Manager o'z nomini ham aytsa va clientda intro yo'q bo'lsa, tegmaydi", () => {
    const segs: Seg[] = [
      { speaker: "client", text: "Alo", start: 0 },
      { speaker: "manager", text: "ismim Visola, kompaniyadan", start: 5 },
      { speaker: "client", text: "Aha, eshityapman", start: 12 },
    ];
    const fixed = autoFixSwappedRoles(segs, "Visola", "test.mp3");
    // Manager hits = 1, client hits = 0 → no swap
    expect(fixed[1].speaker).toBe("manager");
    expect(fixed[2].speaker).toBe("client");
  });

  it("Bo'sh segmentlar list'da xato bermaydi", () => {
    const fixed = autoFixSwappedRoles([], "Visola", "test.mp3");
    expect(fixed).toEqual([]);
  });

  it("Qisqa firstName (1 char) tegmaydi (false positive xavfi)", () => {
    const segs: Seg[] = [
      { speaker: "client", text: "ismim X", start: 0 },
      { speaker: "manager", text: "Salom", start: 5 },
    ];
    const fixed = autoFixSwappedRoles(segs, "X", "test.mp3");
    expect(fixed[0].speaker).toBe("client"); // firstName too short, skipped
    expect(fixed[1].speaker).toBe("manager");
  });
});
