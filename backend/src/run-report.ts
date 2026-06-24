import dotenv from "dotenv";
dotenv.config();

import { prisma } from "./utils/prisma";
import { makeRequest } from "./services/amocrm";

const COMPANY_ID = "cmnip6jb1000075z6oed7lnlx";

interface AmoNote {
  id: number;
  note_type: string;
  responsible_user_id: number;
  created_at: number;
  params: { duration?: number; phone?: string; link?: string };
}

interface AmoLead {
  id: number;
  name: string;
  responsible_user_id: number;
  created_at: number;
}

async function main() {
  // Mart oyi: 2026-03-01 — 2026-03-31
  const marchStart = new Date("2026-03-01").getTime() / 1000;
  const marchEnd = new Date("2026-04-01").getTime() / 1000;

  console.log("Mart oyi hisoboti tayyorlanmoqda...\n");

  // Menejerlar mapping
  const managers = await prisma.manager.findMany({ where: { companyId: COMPANY_ID } });
  const managerMap = new Map<string, string>();
  for (const m of managers) {
    managerMap.set(m.id.replace("amo_", ""), m.name);
  }

  // Statistika
  const stats: Record<string, { calls: number; totalDuration: number }> = {};
  let totalCalls = 0;
  let totalDuration = 0;
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    process.stdout.write(`\rSahifa ${page}...`);

    const leadsResponse = (await makeRequest(
      COMPANY_ID,
      "get",
      `/leads?limit=50&page=${page}&filter[created_at][from]=${Math.floor(marchStart)}&filter[created_at][to]=${Math.floor(marchEnd)}`
    )) as { _embedded?: { leads?: AmoLead[] } };

    const leads = leadsResponse?._embedded?.leads || [];
    if (leads.length === 0) { hasMore = false; break; }

    for (const lead of leads) {
      try {
        const notesResponse = (await makeRequest(
          COMPANY_ID,
          "get",
          `/leads/${lead.id}/notes?limit=100`
        )) as { _embedded?: { notes?: AmoNote[] } };

        const notes = notesResponse?._embedded?.notes || [];
        const callNotes = notes.filter(
          (n) =>
            (n.note_type === "call_in" || n.note_type === "call_out") &&
            n.params?.duration &&
            n.params.duration > 10
        );

        for (const note of callNotes) {
          const amoUserId = String(note.responsible_user_id);
          const managerName = managerMap.get(amoUserId) || `ID:${amoUserId}`;
          const dur = note.params.duration || 0;

          if (!stats[managerName]) stats[managerName] = { calls: 0, totalDuration: 0 };
          stats[managerName].calls++;
          stats[managerName].totalDuration += dur;
          totalCalls++;
          totalDuration += dur;
        }
      } catch {
        // skip
      }
    }

    if (leads.length < 50) hasMore = false;
    else { page++; await new Promise((r) => setTimeout(r, 500)); }
    if (page > 50) hasMore = false;
  }

  console.log("\n\n========================================");
  console.log("  MART 2026 — QO'NG'IROQLAR HISOBOTI");
  console.log("========================================\n");

  // Sort by calls
  const sorted = Object.entries(stats).sort((a, b) => b[1].calls - a[1].calls);

  console.log(`${"Menejer".padEnd(20)} ${"Qo'ng'iroqlar".padEnd(15)} ${"Davomiylik".padEnd(15)} Soat`);
  console.log("-".repeat(65));

  for (const [name, s] of sorted) {
    const hours = (s.totalDuration / 3600).toFixed(1);
    const mins = Math.floor(s.totalDuration / 60);
    console.log(`${name.padEnd(20)} ${String(s.calls).padEnd(15)} ${String(mins + " daqiqa").padEnd(15)} ${hours} soat`);
  }

  console.log("-".repeat(65));
  const totalHours = (totalDuration / 3600).toFixed(1);
  const totalMins = Math.floor(totalDuration / 60);
  console.log(`${"JAMI".padEnd(20)} ${String(totalCalls).padEnd(15)} ${String(totalMins + " daqiqa").padEnd(15)} ${totalHours} soat`);
  console.log(`\nMenejerlar soni: ${sorted.length}`);
  console.log(`Jami qo'ng'iroqlar: ${totalCalls}`);
  console.log(`Jami davomiylik: ${totalHours} soat (${totalMins} daqiqa)`);

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
