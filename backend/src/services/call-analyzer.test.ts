import { describe, it, expect } from "vitest";
import { applyAnalysisFallbacks, buildAnalysisPrompt } from "./call-analyzer";

const MINIMAL_VALID = JSON.stringify({
  summary: "Qisqacha tahlil",
  overallScore: 75,
  leadQuality: "iliq",
  leadScore: 60,
  criteria: { mezon1: 80, mezon2: 70, mezon3: 75 },
  errors: [],
  winPoints: [{ description: "Yaxshi salomlashish" }],
  lossPoints: [],
  objectionsList: [],
  managerSpeechPercent: 55,
  clientSpeechPercent: 45,
});

describe("applyAnalysisFallbacks — JSON parse strategiyalari", () => {
  it("toza JSON ni parse qila olishi kerak", () => {
    const result = applyAnalysisFallbacks(MINIMAL_VALID, "salom");
    expect(result.overallScore).toBe(75);
    expect(result.summary).toBe("Qisqacha tahlil");
  });

  it("markdown fence ichidan JSON ni topa olishi kerak", () => {
    const wrapped = "```json\n" + MINIMAL_VALID + "\n```";
    const result = applyAnalysisFallbacks(wrapped, "salom");
    expect(result.overallScore).toBe(75);
  });

  it("preamble matn bilan JSON ni topa olishi kerak", () => {
    const withPreamble = `Mana tahlil natijasi: ${MINIMAL_VALID} Ko'rib chiqing.`;
    const result = applyAnalysisFallbacks(withPreamble, "salom");
    expect(result.overallScore).toBe(75);
  });

  it("buzilgan JSON da xato beradi", () => {
    expect(() => applyAnalysisFallbacks("yo'q narsa", "salom")).toThrow();
  });
});

describe("applyAnalysisFallbacks — fallback maydonlari", () => {
  it("followupSignal ni 'o'ylayman' iborasidan aniqlashi kerak", () => {
    const result = applyAnalysisFallbacks(MINIMAL_VALID, "Mijoz: men o'ylayman, keyin aytaman");
    expect(result.followupSignal.requiresFollowup).toBe(true);
    expect(result.followupSignal.followupReason).toBe("thinking");
  });

  it("followupSignal ni 'oilam bilan maslahat' iborasidan aniqlashi kerak", () => {
    const result = applyAnalysisFallbacks(MINIMAL_VALID, "Oilam bilan maslahat qilaman");
    expect(result.followupSignal.followupReason).toBe("family_consultation");
  });

  it("transcriptda follow-up belgilari yo'q bo'lsa requiresFollowup=false", () => {
    const result = applyAnalysisFallbacks(MINIMAL_VALID, "Yaxshi, sotib olaman");
    expect(result.followupSignal.requiresFollowup).toBe(false);
  });

  it("21 ta majburiy maydon mavjud bo'lishi kerak", () => {
    const result = applyAnalysisFallbacks(MINIMAL_VALID, "salom");
    const required = [
      "summary", "overallScore", "leadQuality", "leadScore",
      "criteria", "errors", "winPoints", "lossPoints", "objectionsList",
      "managerSpeechPercent", "clientSpeechPercent",
      "coachingInsights", "followupSignal", "promises",
      "qualification",
      "callStructure", "questions", "closeAttempts",
      "voiceOfCustomer", "intentSignals",
    ];
    for (const field of required) {
      expect(result).toHaveProperty(field);
    }
  });

  it("callStructure default phases bo'sh array bo'lishi kerak", () => {
    const result = applyAnalysisFallbacks(MINIMAL_VALID, "salom");
    expect(Array.isArray(result.callStructure?.phases)).toBe(true);
    expect(result.callStructure?.structureScore).toBe(50);
  });

  it("questions.sopranoBreakdown 7 SOPRANO maydoni bilan bo'lishi kerak", () => {
    const result = applyAnalysisFallbacks(MINIMAL_VALID, "salom");
    expect(result.questions?.sopranoBreakdown).toEqual({
      situation: 0,
      objective: 0,
      problem: 0,
      resources: 0,
      alternatives: 0,
      need: 0,
      outcome: 0,
    });
  });

});

describe("buildAnalysisPrompt", () => {
  const transcription = "[00:00] Menejer: Salom\n[00:05] Mijoz: Aha";
  const criteriaText = "- Mezon1 (vazn: 50%): tavsif\n- Mezon2 (vazn: 50%): tavsif";
  const criteriaNames = ["Mezon1", "Mezon2"];

  it("transkripsiya promptga qo'shilgan bo'lishi kerak", () => {
    const p = buildAnalysisPrompt(transcription, criteriaText, "sotuv", criteriaNames);
    expect(p).toContain(transcription);
  });

  it("criteria nomlari schema'da paydo bo'lishi kerak", () => {
    const p = buildAnalysisPrompt(transcription, criteriaText, "sotuv", criteriaNames);
    expect(p).toContain("Mezon1");
    expect(p).toContain("Mezon2");
  });

  it("sotuv kategoriyasi 1-qo'ng'iroq qoidalarini ishlatishi kerak", () => {
    const p = buildAnalysisPrompt(transcription, criteriaText, "sotuv", criteriaNames);
    expect(p).toContain("1-QO'NG'IROQ");
    expect(p).not.toContain("QAYTA QO'NG'IROQ — menejer bu mijoz bilan OLDIN");
  });

  it("qayta kategoriyasi qayta qo'ng'iroq qoidalarini ishlatishi kerak", () => {
    const p = buildAnalysisPrompt(transcription, criteriaText, "qayta", criteriaNames);
    expect(p).toContain("QAYTA QO'NG'IROQ");
    expect(p).toContain("Kontekstni eslatish");
  });

  it("courseInfo berilsa fact-check bloki qo'shilishi kerak", () => {
    const courseInfo = "Vision School: ingliz tili kursi, narxi 2.4M so'm";
    const p = buildAnalysisPrompt(transcription, criteriaText, "sotuv", criteriaNames, courseInfo);
    expect(p).toContain("KOMPANIYA VA KURS MA'LUMOTLARI");
    expect(p).toContain(courseInfo);
    expect(p).toContain("FACT-CHECK QOIDASI");
  });

  it("courseInfo bo'sh bo'lsa fact-check bloki qo'shilmaydi", () => {
    const p = buildAnalysisPrompt(transcription, criteriaText, "sotuv", criteriaNames, "");
    expect(p).not.toContain("KOMPANIYA VA KURS MA'LUMOTLARI");
  });

  it("playbook berilsa promptga top performer ma'lumoti qo'shiladi", () => {
    const playbook = {
      managerName: "DAVRON",
      conversionRate: 48,
      techniques: ["SOPRANO", "BANT"],
    };
    const p = buildAnalysisPrompt(
      transcription,
      criteriaText,
      "sotuv",
      criteriaNames,
      "",
      playbook
    );
    expect(p.toLowerCase()).toContain("davron");
  });

  it("criteriaNames bo'sh bo'lsa default 5 ta sotuv mezoni ishlatiladi", () => {
    const p = buildAnalysisPrompt(transcription, criteriaText, "sotuv", []);
    expect(p).toContain("Salomlashish va suhbatni boshlash");
    expect(p).toContain("SOPRANO texnikasi");
  });

  it("criteriaNames bo'sh + qayta kategoriyasi default qayta mezonlarini ishlatadi", () => {
    const p = buildAnalysisPrompt(transcription, criteriaText, "qayta", []);
    expect(p).toContain("Kontekstni eslatish");
    expect(p).toContain("Yangi sabab bilan chiqish");
  });
});

describe("applyAnalysisFallbacks — overallScore validatsiyasi", () => {
  it("100 dan katta bo'lsa 0 ga o'rnatilishi kerak", () => {
    const overflow = JSON.stringify({ ...JSON.parse(MINIMAL_VALID), overallScore: 150 });
    const result = applyAnalysisFallbacks(overflow, "salom");
    expect(result.overallScore).toBe(0);
  });

  it("manfiy bo'lsa 0 ga o'rnatilishi kerak", () => {
    const negative = JSON.stringify({ ...JSON.parse(MINIMAL_VALID), overallScore: -10 });
    const result = applyAnalysisFallbacks(negative, "salom");
    expect(result.overallScore).toBe(0);
  });

  it("string bo'lsa 0 ga o'rnatilishi kerak", () => {
    const str = JSON.stringify({ ...JSON.parse(MINIMAL_VALID), overallScore: "75" });
    const result = applyAnalysisFallbacks(str, "salom");
    expect(result.overallScore).toBe(0);
  });
});
