import { prisma } from "./src/utils/prisma";
import { refreshObjectionLibrary } from "./src/services/objection-library";

async function main() {
  const companyId = "cmoocj60x000011y0b7wfmphw";
  console.log("[Objection] Starting...");
  const t0 = Date.now();
  try {
    const result = await refreshObjectionLibrary(companyId);
    console.log(`[Objection] Done in ${((Date.now()-t0)/1000).toFixed(1)}s`);
    console.log("Library entries:", Array.isArray(result) ? result.length : "saved");
  } catch (e) {
    console.error("ERROR:", (e as Error).message);
  }
  process.exit(0);
}
main().catch(e => { console.error("FATAL:", e); process.exit(1); });
