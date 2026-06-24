import dotenv from "dotenv";
dotenv.config();

import { syncCalls } from "./services/amocrm-sync";

const COMPANY_ID = "cmnip6jb1000075z6oed7lnlx";

async function main() {
  console.log("Starting AmoCRM sync (April 2026)...");
  try {
    const result = await syncCalls(COMPANY_ID, "2026-04-01");
    console.log("Sync result:", result);
  } catch (err) {
    console.error("Sync error:", err);
  }
  process.exit(0);
}

main();
