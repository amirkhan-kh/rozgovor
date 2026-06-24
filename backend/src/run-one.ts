import dotenv from "dotenv";
dotenv.config();

import { processAudioFile } from "./services/processor";

const AUDIO_ID = process.argv[2] || "cmniqjujl008jvgpugx3ef4z9";

async function main() {
  console.log("Processing:", AUDIO_ID);
  try {
    await processAudioFile(AUDIO_ID);
    console.log("Done!");
  } catch (err) {
    console.error("Error:", err);
  }
  process.exit(0);
}

main();
