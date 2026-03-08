#!/usr/bin/env bash
set -euo pipefail

# Allow alias for convenience
DATABASE_URL="${DATABASE_URL:-${SUPABASE_DB_URL:-}}"
AUTH_TOKEN="${AUTH_TOKEN:-${DASHTRADE_AUTH_TOKEN:-dashtrade-dev-token}}"
PORT="${PORT:-8787}"
PG_SSL="${PG_SSL:-true}"
DEFAULT_USER_ID="${DASHTRADE_USER_ID:-my-personal-account}"

if [[ -z "$DATABASE_URL" ]]; then
  cat >&2 <<'MSG'
[error] DATABASE_URL belum diset.

Catatan penting:
- Yang ada di tab "API Keys" Supabase (Project URL / Publishable Key / anon key) BUKAN koneksi Postgres.
- Ambil connection string dari Supabase: Project Settings -> Database -> Connection string (URI).

Anda bisa set salah satu:
- DATABASE_URL='postgres://...'
- SUPABASE_DB_URL='postgres://...'
MSG
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "[error] psql tidak ditemukan. Install PostgreSQL client dulu." >&2
  exit 1
fi

echo "[1/4] Cek koneksi DATABASE_URL..."
psql "$DATABASE_URL" -c 'select 1;' >/dev/null

echo "[2/4] Apply runtime schema ke Supabase/Postgres..."
psql "$DATABASE_URL" -f docs/database/runtime-schema.sql >/dev/null

echo "[3/4] Start DashTrade API (postgres backend) di port $PORT..."
STORAGE_BACKEND=postgres PG_SSL="$PG_SSL" PORT="$PORT" AUTH_TOKEN="$AUTH_TOKEN" DATABASE_URL="$DATABASE_URL" npm start &
SERVER_PID=$!

cleanup() {
  if kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "[4/4] Health check..."
for _ in {1..20}; do
  if curl -fsS "http://localhost:${PORT}/api/health" >/dev/null; then
    break
  fi
  sleep 0.5
done

curl -fsS "http://localhost:${PORT}/api/health" | sed 's/^/[ok] /'
cat <<MSG

DashTrade API aktif. Tekan Ctrl+C untuk stop.
Default config yang dipakai:
- AUTH_TOKEN=$AUTH_TOKEN
- DASHTRADE_USER_ID=$DEFAULT_USER_ID

Set di browser/device (sekali):
localStorage.setItem('dashtrade.apiBase', 'http://localhost:${PORT}');
localStorage.setItem('dashtrade.apiToken', '$AUTH_TOKEN');
localStorage.setItem('dashtrade.userId', '$DEFAULT_USER_ID');
MSG

wait "$SERVER_PID"
