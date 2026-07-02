#!/usr/bin/env bash
# ROZGOVOR backend deploy — Bitrix sync/reconcile yangilanishi.
# Faqat `rozgovorsalesai-backend` ga tegadi (boshqa instanslarga EMAS).
#
# Ishlatish (Terminal'da, parol BIR MARTA so'raladi):
#   bash backend/scripts/deploy-rozgovor.sh
set -euo pipefail

SERVER="root@157.180.46.214"
B="/var/www/rozgovorsalesai-backend"
CP="/tmp/rozc-deploy"
HERE="$(cd "$(dirname "$0")/.." && pwd)" # backend/

# Ko'chiriladigan fayllar (commit versiyasi + faqat shu sessiya o'zgarishi — clean).
# sales.controller.ts ATAYLAB chiqarib tashlandi (oldingi sessiya o'zgarishlari prod'da
# borligi noaniq; yangi sync/reconcile uchun shart emas — psg-default landmine'i env
# o'rnatilgani uchun zararsiz qoladi).
FILES=(
  "src/controllers/coach.controller.ts"
  "src/services/bitrix-sync.ts"
  "src/services/scheduler.ts"
  "src/utils/bitrix-config.ts"
  "src/services/bitrix-managers-sync.ts"
  "src/controllers/activities.controller.ts"
  "scripts/bitrix-diag.js"
  "scripts/bitrix-webhook-doctor.js"
)

echo "==> Lokal fayllar tekshirilyapti..."
for f in "${FILES[@]}"; do
  [ -f "$HERE/$f" ] || { echo "YO'Q: $HERE/$f"; exit 1; }
done

echo "==> SSH master ochilyapti — parol SHU YERDA bir marta so'raladi..."
ssh -fNM -o ControlPath="$CP" -o ControlPersist=15m "$SERVER"

run()  { ssh -o ControlPath="$CP" "$SERVER" "$@"; }
copy() { scp -q -o ControlPath="$CP" "$1" "$SERVER:$2"; }

echo "==> Ulanish: $(run 'hostname')"

TS="$(run 'date +%Y%m%d_%H%M%S')"
echo "==> Backup → $B/_backup_$TS"
run "mkdir -p $B/_backup_$TS/{src/services,src/utils,src/controllers,scripts}"
for f in "${FILES[@]}"; do
  run "[ -f $B/$f ] && cp $B/$f $B/_backup_$TS/$f || true"
done

echo "==> Fayllar ko'chirilyapti..."
for f in "${FILES[@]}"; do
  run "mkdir -p $B/$(dirname "$f")"
  copy "$HERE/$f" "$B/$f"
  echo "   + $f"
done

echo "==> Build + restart (faqat rozgovorsalesai-backend)..."
run "cd $B && npm run build && pm2 restart rozgovorsalesai-backend --update-env"

echo ""
echo "==> Scheduler log (yangi reconcile qatorlari):"
run "pm2 logs rozgovorsalesai-backend --lines 40 --nostream 2>/dev/null | grep -iE 'reconcile|incremental|Bitrix' | tail -6 || true"

echo ""
echo "==> Sverka (prod DB ↔ Bitrix, oxirgi 2 kun) — farq ≈ 0 bo'lishi kerak:"
run "cd $B && node -r dotenv/config scripts/bitrix-diag.js --days 2 2>&1 | grep -E '===|DB:|farq' || true"

echo ""
echo "==> TUGADI. Backup: $B/_backup_$TS . Master 15 daq ichida o'zi yopiladi."
