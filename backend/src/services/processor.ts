import { prisma } from "../utils/prisma";
import axios from "axios";
import { getFileBuffer, getKeyFromUrl } from "./storage";

// Audio URL'dan buffer olish — tashqi URL (Bitrix onlinepbx) bo'lsa axios bilan
async function fetchAudioBuffer(fileUrl: string): Promise<Buffer> {
  const isExternalUrl =
    /^https?:\/\//.test(fileUrl) &&
    !fileUrl.includes("yandexcloud.net");
  if (isExternalUrl) {
    const resp = await axios.get(fileUrl, {
      responseType: "arraybuffer",
      timeout: 180000,
      validateStatus: () => true,
    });
    if (resp.status >= 400) {
      throw new Error(`External audio fetch failed: ${resp.status}`);
    }
    return Buffer.from(resp.data);
  }
  const key = getKeyFromUrl(fileUrl);
  return getFileBuffer(key);
}
import { transcribeAudio } from "./call-transcriber";
import { analyzeCall, getCriteriaPrompt } from "./call-analyzer";

export const processAudioFile = async (audioFileId: string): Promise<void> => {
  try {
    // 1. AudioFile DB dan ol
    const audioFile = await prisma.audioFile.findUnique({
      where: { id: audioFileId },
      include: { company: true, manager: { select: { name: true } } },
    });

    if (!audioFile) {
      console.error(`AudioFile not found: ${audioFileId}`);
      return;
    }

    // 2. Status → processing
    await prisma.audioFile.update({
      where: { id: audioFileId },
      data: { status: "processing" },
    });

    // 3. Qisqa audio tekshiruvi — 2 daqiqadan kam audiolar tahlil qilinmaydi
    if (audioFile.duration && audioFile.duration < 120) {
      console.log(`AudioFile ${audioFileId}: juda qisqa (${audioFile.duration}s) — too_short`);
      await prisma.audioFile.update({ where: { id: audioFileId }, data: { status: "too_short" } });
      return;
    }

    // 4. Audio buffer yuklab ol (S3 yoki tashqi URL)
    const buffer = await fetchAudioBuffer(audioFile.fileUrl);

    // 4. Yandex deferred STT + Gemini diarization (sotuv qo'ng'iroqlari uchun ~4× arzon).
    //    Imtihon/trainer interactive emas — bu yerda kechikish 1-3 daqiqa qabul qilinadi.
    const managerName = audioFile.manager?.name || "Menejer";
    let transcription = await transcribeAudio(buffer, audioFile.fileName, managerName, audioFile.duration || 0, true);

    // Transkripsiya validatsiyasi — bo'sh yoki juda qisqa bo'lsa
    if (!transcription || transcription.trim().length < 5) {
      console.warn(`AudioFile ${audioFileId}: transkripsiya bo'sh yoki juda qisqa`);
      transcription = "SUHBAT YO'Q: Transkripsiya bo'sh";
    }
    console.log(`Transcription done: ${transcription.split("\n").length} lines`);

    // Gallyutsinatsiya tekshiruvi AVVAL — keyin DB ga saqlash
    const lineCount = transcription.split("\n").filter((l) => l.trim()).length;
    const audioDuration = audioFile.duration || 0;
    const linesPerMinute = audioDuration > 0 ? (lineCount / audioDuration) * 60 : 0;
    if (audioDuration > 0 && audioDuration <= 60 && linesPerMinute > 15) {
      console.log(`AudioFile ${audioFileId}: gallyutsinatsiya aniqlandi (${lineCount} gap / ${audioDuration}s = ${linesPerMinute.toFixed(1)} gap/min)`);
      transcription = "SUHBAT YO'Q: Gallyutsinatsiya aniqlandi";
      await prisma.audioFile.update({
        where: { id: audioFileId },
        data: { transcription, status: "no_conversation" },
      });
      return;
    }

    // Takrorlanuvchi gap gallyutsinatsiyasi — bir xil gap 3+ marta takrorlansa
    const lines = transcription.split("\n").filter((l) => l.trim());
    const textOnly = lines.map((l) => l.replace(/\[\d{2}:\d{2}\]\s*(Menejer|Mijoz|Tizim):\s*/g, "").trim().toLowerCase());
    const freq: Record<string, number> = {};
    for (const t of textOnly) { if (t.length > 5) freq[t] = (freq[t] || 0) + 1; }
    const maxRepeat = Math.max(0, ...Object.values(freq));
    if (maxRepeat >= 3 && lines.length > 5) {
      console.log(`AudioFile ${audioFileId}: takrorlanuvchi gallyutsinatsiya (max ${maxRepeat}x takror)`);
      transcription = "SUHBAT YO'Q: Gallyutsinatsiya aniqlandi";
      await prisma.audioFile.update({
        where: { id: audioFileId },
        data: { transcription, status: "no_conversation" },
      });
      return;
    }

    // Suhbat yo'q bo'lsa — tahlil qilmasdan no_conversation qilish
    // Voicemail/avtomat xabarlar: "abonent javob bera olmaydi", "keyinroq qo'ng'iroq qiling" va h.k.
    const lowerTranscription = transcription.toLowerCase();
    const voicemailPhrases = [
      "abonent hozir javob bera olmaydi",
      "javob bera olmaydi",
      "keyinroq qo'ng'iroq qiling",
      "abonent v danniy moment",
      "otvetit ne mojet",
      "perezvonite",
      "subscriber cannot answer",
      "call back later",
      "telefon o'chirilgan",
      "telefon o'chib qolgan",
      "raqam mavjud emas",
      "nomer ne sushchestvuyet",
      "number you have dialed",
    ];
    const hasVoicemail = voicemailPhrases.some((p) => lowerTranscription.includes(p));
    if (
      transcription.includes("SUHBAT YO'Q") ||
      transcription.includes("telefon jiringlashi") ||
      transcription.includes("nutq aniqlanmadi") ||
      hasVoicemail
    ) {
      console.log(`AudioFile ${audioFileId}: suhbat yo'q${hasVoicemail ? " (voicemail/avtomat xabar)" : ""}, tahlil o'tkazilmaydi`);
      await prisma.audioFile.update({
        where: { id: audioFileId },
        data: { status: "no_conversation" },
      });
      return;
    }

    // Aloqa uzildi / Transfer tekshiruvi — qisqa suhbatlar uchun
    const linesForCheck = transcription.split("\n").filter((l) => l.trim());
    if (linesForCheck.length <= 8 && audioDuration <= 120) {
      const textLower = linesForCheck.map((l) => l.toLowerCase()).join(" ");

      // Transfer tekshiruvi
      const transferWords = [
        "boshqa menejer", "o'tkazaman", "o'tkazib beraman", "kutib turing",
        "boshqa xodim", "boshqa operator", "bog'layman", "ulayman",
      ];
      if (transferWords.some((w) => textLower.includes(w))) {
        console.log(`AudioFile ${audioFileId}: transfer (${linesForCheck.length} qator, ${audioDuration}s)`);
        await prisma.audioFile.update({
          where: { id: audioFileId },
          data: { transcription, status: "transferred" },
        });
        return;
      }

      // Aloqa uzildi — faqat salomlashish bo'lsa (universal, hardcoded emas)
      if (linesForCheck.length <= 4 && audioDuration <= 60) {
        const realWords = linesForCheck.filter((l) => l.replace(/\[.*?\]/g, "").replace(/Menejer:|Mijoz:|Tizim:/g, "").trim().length > 10);
        if (realWords.length <= 2) {
          console.log(`AudioFile ${audioFileId}: aloqa uzildi (${linesForCheck.length} qator, ${audioDuration}s, ${realWords.length} real)`);
          await prisma.audioFile.update({
            where: { id: audioFileId },
            data: { transcription, status: "disconnected" },
          });
          return;
        }
      }
    }

    // 6. Transcription tekshiruvdan o'tdi — DB ga saqlash
    await prisma.audioFile.update({
      where: { id: audioFileId },
      data: { transcription },
    });

    // 7. Company criteria + topPerformerPlaybook + dinamik mahsulot bilim bazasi
    const { text: criteriaText, criteriaNames } = await getCriteriaPrompt(audioFile.companyId, audioFile.category);
    const company = await prisma.company.findUnique({
      where: { id: audioFile.companyId },
      select: { topPerformerPlaybook: true },
    });
    // Multi-product: audio → productId → Product.knowledgeBase + documents
    // Yo'q bo'lsa → Company.courseInfo fallback
    const { getKnowledgeForAudio } = await import("./product-knowledge");
    const knowledgeContext = await getKnowledgeForAudio(audioFileId);

    // 7a. v3 — CRM yopish/rad sababini analiz vaqtida OLIB KELISH (COUPLED prompt uchun).
    // ⚠️ Online analiz qo'ng'iroqdan darrov keyin → deal-close sabab ko'pincha hali YO'Q.
    // Intake JUNK teg (Lead.rejectReasonName) esa oldin qo'yilgani uchun keladi. Yo'q → null → heuristik.
    let closeReason: string | null = null;
    try {
      const { attachLeadCloseReasons } = await import("../utils/rejection-info");
      const [withReason] = await attachLeadCloseReasons(audioFile.companyId, [audioFile]);
      closeReason =
        (withReason as any)?.leadRejectReasonName || (withReason as any)?.closeReasonName || null;
    } catch (crErr) {
      console.error("[Processor] closeReason join xato:", (crErr as Error).message);
    }

    // 7. Gemini Pro → analysis JSON (mahsulot/kurs + top performer konteksti bilan)
    const analysisResult = await analyzeCall(
      transcription,
      criteriaText,
      audioFile.category,
      criteriaNames,
      knowledgeContext,
      (company?.topPerformerPlaybook as Record<string, any> | null) ?? null,
      null,
      closeReason,
    );

    // 7b. Cost yozish — online audiolar
    try {
      const { recordAudioCost } = await import("./cost-tracker");
      const dur = audioFile.duration || 0;
      void recordAudioCost({
        audioFileId,
        companyId: audioFile.companyId,
        stt: { mode: "online", durationSec: dur, provider: "yandex" },
        flash: { mode: "online", inputTokens: dur * 32, outputTokens: 4000, audioSec: dur },
      });
    } catch {}

    // 8. Analysis modelga saqlash (upsert — qayta tahlilda eski natijani yangilaydi)
    // Follow-up deadline hisoblash
    const fu = analysisResult.followupSignal;
    let followupDeadline: Date | null = null;
    if (fu?.requiresFollowup && fu.suggestedDeadlineDays > 0) {
      followupDeadline = new Date();
      followupDeadline.setDate(followupDeadline.getDate() + fu.suggestedDeadlineDays);
    }

    // Sud Agent — qo'ng'iroq menejer reytingiga adolatli tushishi uchun
    // (vaqt + kontent + kontekst signallari: adashib tushgan, transfer, sovuq lid va h.k.)
    // MUHIM: admin qo'lda override qilgan tahlillarga tegmaymiz — inson qarori ustun.
    const existingAnalysis = await prisma.analysis.findUnique({
      where: { audioFileId },
      select: { judgeOverridden: true, judgeSkipped: true, judgeReason: true },
    });
    const { judgeCall } = await import("./judge-agent");
    const criteriaScoresArr = Object.values(
      analysisResult.criteria || {}
    ).map((c: any) => Number(c?.score) || 0);
    const verdict = existingAnalysis?.judgeOverridden
      ? {
          skipped: existingAnalysis.judgeSkipped,
          reason: existingAnalysis.judgeReason,
        }
      : judgeCall({
          durationSeconds: audioFile.duration ?? null,
          managerSpeechPercent: analysisResult.managerSpeechPercent ?? null,
          clientSpeechPercent: analysisResult.clientSpeechPercent ?? null,
          criteriaScores: criteriaScoresArr,
          leadScore: analysisResult.leadScore ?? null,
          summary: analysisResult.summary ?? null,
          leadQuality: analysisResult.leadQuality ?? null,
        });
    if (verdict.skipped && !existingAnalysis?.judgeOverridden) {
      console.log(
        `[judge-agent] SKIP audioFile=${audioFileId}: ${verdict.reason}`,
      );
    }

    const analysisData = {
      summary: analysisResult.summary,
      overallScore: analysisResult.overallScore,
      leadQuality: analysisResult.leadQuality,
      leadScore: analysisResult.leadScore,
      criteria: JSON.parse(JSON.stringify(analysisResult.criteria)),
      errors: JSON.parse(JSON.stringify(analysisResult.errors)),
      winPoints: JSON.parse(JSON.stringify(analysisResult.winPoints)),
      lossPoints: JSON.parse(JSON.stringify(analysisResult.lossPoints)),
      objections: JSON.parse(JSON.stringify(analysisResult.objectionsList)),
      managerSpeech: analysisResult.managerSpeechPercent,
      clientSpeech: analysisResult.clientSpeechPercent,
      coachingInsights: JSON.parse(JSON.stringify(analysisResult.coachingInsights)),
      // Sud Agent — override qilgan bo'lsa, oldingi qaror saqlanib qoladi
      judgeSkipped: verdict.skipped,
      judgeReason: verdict.reason,
      // judgeOverridden'ni RESET qilmaymiz: update'ga kirmasa Prisma eski qiymatni saqlaydi
      // B2-2 follow-up signal
      requiresFollowup: fu?.requiresFollowup || false,
      followupReason: fu?.followupReason || null,
      followupPhrase: fu?.followupPhrase || null,
      followupDeadline,
      followupCompleted: false, // default — boshqa qo'ng'iroq kelsa true qilinadi
      // B2-9 promises
      promises: analysisResult.promises ? JSON.parse(JSON.stringify(analysisResult.promises)) : null,
      // B3-4 MEDDIC/BANT
      qualification: analysisResult.qualification
        ? JSON.parse(JSON.stringify(analysisResult.qualification))
        : null,
      // B4-1 kengaytirilgan field'lar
      callStructure: analysisResult.callStructure ? JSON.parse(JSON.stringify(analysisResult.callStructure)) : null,
      questionsData: analysisResult.questions ? JSON.parse(JSON.stringify(analysisResult.questions)) : null,
      closeAttempts: analysisResult.closeAttempts ? JSON.parse(JSON.stringify(analysisResult.closeAttempts)) : null,
      voiceOfCustomer: analysisResult.voiceOfCustomer ? JSON.parse(JSON.stringify(analysisResult.voiceOfCustomer)) : null,
      clientProfile: (analysisResult as unknown as { clientProfile?: unknown }).clientProfile
        ? JSON.parse(JSON.stringify((analysisResult as unknown as { clientProfile?: unknown }).clientProfile))
        : null,
      closeReasonVerdict: (analysisResult as unknown as { closeReasonVerdict?: unknown }).closeReasonVerdict
        ? JSON.parse(JSON.stringify((analysisResult as unknown as { closeReasonVerdict?: unknown }).closeReasonVerdict))
        : null,
    };
    await prisma.analysis.upsert({
      where: { audioFileId },
      create: { audioFileId, ...analysisData },
      update: analysisData,
    });

    // Mijoz profilini aggregate qilish (Client jadvali)
    try {
      const { aggregateClientFromAnalysis } = await import("./client-profiler");
      await aggregateClientFromAnalysis(audioFileId);
    } catch (err) {
      console.error("[client-profiler] aggregation error:", (err as Error).message);
    }

    // Follow-up completion: agar bu audio shu leadga YANGI qo'ng'iroq bo'lsa,
    // oldingi shu leaddagi requiresFollowup=true tahlillarni "completed" qilish
    if (audioFile.leadId) {
      try {
        await prisma.analysis.updateMany({
          where: {
            audioFile: {
              leadId: audioFile.leadId,
              id: { not: audioFileId },
              callDate: { lt: audioFile.callDate || new Date() },
            },
            requiresFollowup: true,
            followupCompleted: false,
          },
          data: { followupCompleted: true },
        });
      } catch (fuErr) {
        console.error("[Processor] followup completion update error:", fuErr);
      }
    }

    // 9. AudioFile status → done
    await prisma.audioFile.update({
      where: { id: audioFileId },
      data: { status: "done" },
    });

    // 9b. AmoCRM task auto-creation (B3-3)
    // Faqat 1-haftalik deadline'li follow-up/qayta ishlash vazifalari AmoCRM'ga
    // yuboriladi. Uzoq muddatli (3 oy va undan keyin) recycling AmoCRM'ni to'sib
    // qo'ymasligi uchun — menejerlar ulgurishi va yangi leadlarga vaqt qolishi uchun.
    // DISABLE_AI_TASKS=1 env bilan butunlay o'chirib qo'yiladi (per-tenant toggle).
    const MAX_TASK_DEADLINE_DAYS = 7;
    const aiTasksDisabled = process.env.DISABLE_AI_TASKS === "1";
    if (
      !aiTasksDisabled &&
      audioFile.leadId &&
      analysisResult.followupSignal?.requiresFollowup
    ) {
      try {
        const fu = analysisResult.followupSignal;
        const requestedDays = fu.suggestedDeadlineDays || 3;
        if (requestedDays > MAX_TASK_DEADLINE_DAYS) {
          console.log(
            `[Processor] skip AmoCRM task (lead ${audioFile.leadId}): deadline ${requestedDays}d > ${MAX_TASK_DEADLINE_DAYS}d (long-term recycling, not flooding AmoCRM)`,
          );
        } else {
          const { createLeadTask } = await import("./amocrm");
          const reasonLabel: Record<string, string> = {
            thinking: "Mijoz 'o'ylayman' dedi",
            family_consultation: "Mijoz yaqinlari bilan maslahatlashadi",
            price: "Mijozda narx haqida savol",
            timing: "Mijoz keyinroq xohladi",
            other: "Keyin qaytadan qo'ng'iroq kerak",
          };
          const label = reasonLabel[fu.followupReason || "other"] || "Follow-up kerak";
          const quickFix = analysisResult.coachingInsights?.quickFix || "Aniq keyingi qadamni belgilang";
          await createLeadTask(audioFile.companyId, {
            leadId: audioFile.leadId,
            text: `🤖 SalesAI: ${label}. ${quickFix}`,
            completeTillDays: Math.min(requestedDays, MAX_TASK_DEADLINE_DAYS),
          });
        }
      } catch (taskErr) {
        console.error("[Processor] AmoCRM task creation error:", taskErr);
      }
    }

    // 10. Telegram notification (agar yoqilgan bo'lsa)
    if (audioFile.company.telegramId && audioFile.company.sendEachAnalysis) {
      try {
        const { sendAnalysisResult } = await import("./telegram");
        const manager = audioFile.managerId
          ? await prisma.manager.findUnique({ where: { id: audioFile.managerId } })
          : null;

        const analysisData = {
          manager: manager?.name || "Noma'lum",
          phone: audioFile.phoneNumber || "—",
          fileName: audioFile.fileName,
          score: analysisResult.overallScore,
          quality: analysisResult.leadQuality,
          leadScore: analysisResult.leadScore,
          category: audioFile.category || "boshqa",
          criteria: analysisResult.criteria as Record<string, { score: number }>,
          wins: analysisResult.winPoints.length,
          losses: analysisResult.lossPoints.length,
          errors: analysisResult.errors.length,
          objections: analysisResult.objectionsList.length,
          managerSpeech: analysisResult.managerSpeechPercent,
          clientSpeech: analysisResult.clientSpeechPercent,
          summary: analysisResult.summary,
          audioId: audioFile.id,
          coachingInsights: analysisResult.coachingInsights,
        };
        // Admin'ga yuborish
        await sendAnalysisResult(audioFile.company.telegramId, analysisData);
        // ROP'larga yuborish (admin bilan bir xil format)
        const rops = await prisma.manager.findMany({
          where: { companyId: audioFile.companyId, role: "rop", isActive: true, telegramId: { not: null } },
          select: { telegramId: true },
        });
        for (const rop of rops) {
          if (rop.telegramId) await sendAnalysisResult(rop.telegramId, analysisData);
        }
        // Manager'ga yuborish (faqat o'ziniki, qisqa format)
        if (audioFile.managerId) {
          const { sendAnalysisToManager } = await import("./telegram");
          await sendAnalysisToManager(audioFile.managerId, analysisData);
        }
      } catch (telegramErr) {
        console.error("Telegram notification error:", telegramErr);
      }
    }

    console.log(`AudioFile ${audioFileId} processed successfully`);
  } catch (err) {
    console.error(`Process audio error for ${audioFileId}:`, err);

    // 11. Xato bo'lsa: status → error
    try {
      await prisma.audioFile.update({
        where: { id: audioFileId },
        data: { status: "error" },
      });
    } catch (updateErr) {
      console.error("Failed to update status to error:", updateErr);
    }
  }
};
