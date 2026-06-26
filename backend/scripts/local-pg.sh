#!/usr/bin/env bash
# Lokal, izolyatsiya qilingan Postgres (Docker'siz, venv uslubi).
# Binarlar: backend/.pgbin (zonky embedded-postgres, Maven'dan).
# Ma'lumotlar: backend/.pgdata. Ikkalasi ham gitignore'da.
#
#   bash scripts/local-pg.sh init    # cluster + salesai db (trust auth)
#   bash scripts/local-pg.sh start   # ishga tushirish (5432)
#   bash scripts/local-pg.sh stop    # to'xtatish
#   bash scripts/local-pg.sh status
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"   # backend/
PGBIN="$DIR/.pgbin/bin"
PGDATA="$DIR/.pgdata"
PORT=5432
DB_USER="salesai"
DB_NAME="salesai"

[ -x "$PGBIN/initdb" ] || { echo "Postgres binar yo'q: $PGBIN (Maven'dan yuklang)"; exit 1; }

case "${1:-}" in
  init)
    if [ -d "$PGDATA" ]; then
      echo "Cluster allaqachon bor: $PGDATA"
    else
      # Superuser = salesai, lokal ulanishlar trust (parol tekshirilmaydi — lokal dev)
      "$PGBIN/initdb" -D "$PGDATA" -U "$DB_USER" --auth=trust --encoding=UTF8 >/dev/null
      echo "Cluster yaratildi (superuser=$DB_USER, trust auth)"
    fi
    # salesai DB — server to'xtoq holatda single-user rejimda yaratiladi (psql yo'q)
    if [ ! -f "$PGDATA/.dbcreated" ]; then
      echo "CREATE DATABASE $DB_NAME OWNER $DB_USER;" | "$PGBIN/postgres" --single -D "$PGDATA" postgres >/dev/null 2>&1 \
        && touch "$PGDATA/.dbcreated" && echo "DB '$DB_NAME' yaratildi" \
        || echo "DB yaratishda ogohlantirish (ehtimol allaqachon bor)"
    fi
    "$PGBIN/pg_ctl" -D "$PGDATA" -o "-p $PORT" -l "$PGDATA/server.log" -w start
    echo "OK → postgresql://$DB_USER@localhost:$PORT/$DB_NAME (trust, parolsiz lokal)"
    ;;
  start) "$PGBIN/pg_ctl" -D "$PGDATA" -o "-p $PORT" -l "$PGDATA/server.log" -w start ;;
  stop)  "$PGBIN/pg_ctl" -D "$PGDATA" -w stop ;;
  status) "$PGBIN/pg_ctl" -D "$PGDATA" status || true ;;
  *) echo "Foydalanish: bash scripts/local-pg.sh {init|start|stop|status}"; exit 1 ;;
esac
