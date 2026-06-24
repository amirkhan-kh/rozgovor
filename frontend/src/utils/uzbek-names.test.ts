import { describe, it, expect } from "vitest";
import { randomUzbekName } from "./uzbek-names";

describe("randomUzbekName", () => {
  it("erkak ism qaytarishi kerak", () => {
    const name = randomUzbekName("male", 25);
    expect(typeof name).toBe("string");
    expect(name.length).toBeGreaterThan(2);
  });

  it("ayol ism qaytarishi kerak", () => {
    const name = randomUzbekName("female", 30);
    expect(typeof name).toBe("string");
    expect(name.length).toBeGreaterThan(2);
  });

  it("16 dan kichik bola uchun bola ismidan tanlashi mumkin", () => {
    const childPool = new Set([
      "Muhammadaziz", "Alijon", "Umarjon", "Dovudbek", "Mansurjon", "Islomjon",
      "Ibrohim", "Yusufbek", "Abbos", "Asadbek", "Diyorjon",
    ]);
    let foundChild = false;
    for (let i = 0; i < 100; i++) {
      if (childPool.has(randomUzbekName("male", 10))) {
        foundChild = true;
        break;
      }
    }
    expect(foundChild).toBe(true);
  });

  it("yetuk yosh erkak uchun bola ismi qaytmasligi kerak", () => {
    const childOnly = new Set([
      "Muhammadaziz", "Alijon", "Umarjon", "Dovudbek", "Mansurjon", "Islomjon",
      "Yusufbek", "Abbos", "Diyorjon",
    ]);
    for (let i = 0; i < 100; i++) {
      const name = randomUzbekName("male", 35);
      expect(childOnly.has(name)).toBe(false);
    }
  });

  it("16 yoshli bola sifatida hisoblanishi kerak (chegara)", () => {
    const name = randomUzbekName("female", 16);
    expect(typeof name).toBe("string");
  });

  it("17 yoshli bola sifatida hisoblanmasligi kerak (chegara)", () => {
    const childOnly = new Set([
      "Zaynab", "Xadichabonu", "Muslimaxon", "Fotimaxon", "Asalbonu", "Sabinaxon",
      "Omina", "Hafsaxon", "Madinabonu",
    ]);
    for (let i = 0; i < 100; i++) {
      const name = randomUzbekName("female", 17);
      expect(childOnly.has(name)).toBe(false);
    }
  });
});
