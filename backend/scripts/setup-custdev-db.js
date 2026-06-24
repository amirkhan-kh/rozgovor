// Custdev uchun vaqtinchalik alohida PostgreSQL DB tayyorlaydi.
//
// Ishlatish:
//   CUSTDEV_DATABASE_URL="postgresql://user:pass@host:5432/custdev_tmp" \
//   node scripts/setup-custdev-db.js
//
// Agar CUSTDEV_DATABASE_URL berilmasa, DATABASE_URL ishlatiladi.
// Skript:
//   1) DB mavjud bo'lmasa yaratadi
//   2) Prisma schema'ni shu DB ga push qiladi
//   3) Prisma client generate qiladi

require("dotenv").config();
const { spawnSync } = require("child_process");

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    stdio: "inherit",
    env: options.env || process.env,
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} exited with code ${result.status}`);
  }
}

function redact(url) {
  try {
    const u = new URL(url);
    if (u.password) u.password = "***";
    return u.toString();
  } catch {
    return url;
  }
}

function parseDbUrl(rawUrl) {
  const url = new URL(rawUrl);
  const dbName = url.pathname.replace(/^\//, "");
  if (!dbName) {
    throw new Error("DATABASE URL ichida database nomi yo'q");
  }
  return { url, dbName };
}

function createDbIfMissing(dbUrl) {
  const { url, dbName } = parseDbUrl(dbUrl);
  const adminUrl = new URL(dbUrl);
  adminUrl.pathname = "/postgres";

  const env = {
    ...process.env,
    PGPASSWORD: url.password || process.env.PGPASSWORD || "",
  };

  const check = spawnSync(
    "psql",
    ["-d", adminUrl.toString(), "-tAc", `SELECT 1 FROM pg_database WHERE datname='${dbName}'`],
    { env, stdio: ["ignore", "pipe", "pipe"], shell: false }
  );

  if (check.error) {
    throw new Error(
      `psql topilmadi yoki ulanish mumkin emas: ${check.error.message}. DB server ishlayotganini tekshiring.`
    );
  }
  if (check.status !== 0) {
    throw new Error(
      `Postgres'ga ulanib bo'lmadi. URL: ${redact(adminUrl.toString())}`
    );
  }

  const exists = String(check.stdout || "").trim() === "1";
  if (exists) {
    console.log(`[custdev-setup] DB mavjud: ${dbName}`);
    return;
  }

  console.log(`[custdev-setup] DB yaratilyapti: ${dbName}`);
  const created = spawnSync(
    "psql",
    ["-d", adminUrl.toString(), "-c", `CREATE DATABASE "${dbName}"`],
    { env, stdio: "inherit", shell: false }
  );
  if (created.error) throw created.error;
  if (created.status !== 0) {
    throw new Error(`DB yaratishda xatolik: ${dbName}`);
  }
}

async function main() {
  const targetUrl = process.env.CUSTDEV_DATABASE_URL || process.env.DATABASE_URL;
  if (!targetUrl) {
    throw new Error("CUSTDEV_DATABASE_URL yoki DATABASE_URL topilmadi");
  }

  console.log(`[custdev-setup] target: ${redact(targetUrl)}`);
  createDbIfMissing(targetUrl);

  const env = {
    ...process.env,
    DATABASE_URL: targetUrl,
  };

  console.log("[custdev-setup] Prisma schema push...");
  run("npx", ["prisma", "db", "push", "--schema", "prisma/schema.prisma"], { env });

  console.log("[custdev-setup] Prisma client generate...");
  run("npx", ["prisma", "generate", "--schema", "prisma/schema.prisma"], { env });

  console.log("[custdev-setup] Tayyor ✅");
  console.log(
    `[custdev-setup] Endi batch uchun: CUSTDEV_DATABASE_URL=${targetUrl} node scripts/run-custdev-batch.js`
  );
}

main().catch((err) => {
  console.error("[custdev-setup] FATAL:", err.message || err);
  process.exit(1);
});
