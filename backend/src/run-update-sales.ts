import dotenv from "dotenv";
dotenv.config();

import { prisma } from "./utils/prisma";
import { makeRequest } from "./services/amocrm";

const COMPANY_ID = "cmnip6jb1000075z6oed7lnlx";

async function main() {
  // Barcha CRM dan kelgan audio fayllar
  const audioFiles = await prisma.audioFile.findMany({
    where: { companyId: COMPANY_ID, crmLeadId: { not: null } },
    select: { id: true, crmLeadId: true },
  });

  console.log(`${audioFiles.length} ta audio fayl tekshiriladi...\n`);

  // CRM lead ID larni to'plash — note ID lar (crmLeadId aslida note ID)
  // Lead ID ni olish uchun avval barcha leadlarni olamiz
  let page = 1;
  let hasMore = true;
  const leadStatusMap = new Map<number, number>(); // leadId -> statusId

  while (hasMore) {
    process.stdout.write(`\rLeadlar yuklanmoqda... sahifa ${page}`);
    try {
      const resp = (await makeRequest(COMPANY_ID, "get", `/leads?limit=50&page=${page}`)) as any;
      const leads = resp?._embedded?.leads || [];
      if (leads.length === 0) { hasMore = false; break; }

      for (const lead of leads) {
        leadStatusMap.set(lead.id, lead.status_id);
      }

      if (leads.length < 50) hasMore = false;
      else { page++; await new Promise(r => setTimeout(r, 300)); }
      if (page > 50) hasMore = false;
    } catch {
      hasMore = false;
    }
  }

  console.log(`\n${leadStatusMap.size} ta lead yuklandi.`);

  // Har bir lead uchun note larni tekshirib, qaysi audio qaysi leadga tegishli
  let updated = 0;
  let checked = 0;

  for (const [leadId, statusId] of leadStatusMap) {
    if (statusId !== 142) continue; // Faqat "Успешно реализовано"

    try {
      const notesResp = (await makeRequest(COMPANY_ID, "get", `/leads/${leadId}/notes?limit=100`)) as any;
      const notes = notesResp?._embedded?.notes || [];

      for (const note of notes) {
        const noteId = String(note.id);
        // Bu note ID li audio faylni topish
        const match = audioFiles.find(af => af.crmLeadId === noteId);
        if (match) {
          await prisma.audioFile.update({
            where: { id: match.id },
            data: { isSale: true },
          });
          updated++;
        }
      }
    } catch { /* skip */ }

    checked++;
    if (checked % 10 === 0) process.stdout.write(`\r${checked} ta won lead tekshirildi, ${updated} ta audio yangilandi`);
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`\n\nTayyor! ${updated} ta audio "isSale = true" qilindi.`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
