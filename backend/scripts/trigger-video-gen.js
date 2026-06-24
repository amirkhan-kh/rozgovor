require("ts-node/register");
const { startVideoGeneration } = require("../src/services/manager-videos");
const managerId = process.argv[2] || "bitrix_976";
(async () => {
  try {
    const result = await startVideoGeneration(managerId);
    console.log(`Started ${result.length} videos for ${managerId}:`);
    result.forEach((v) =>
      console.log(`  v${v.scenarioId} ${v.scenarioName} → ${v.operationId?.slice(-30) || "no-op"}`)
    );
  } catch (e) {
    console.error("ERROR:", e.message);
  }
  process.exit(0);
})();
