#!/usr/bin/env bash
# Aplica el esquema completo contra un Postgres local y corre las aserciones de
# supabase/pruebas/. Verifica sintaxis, orden de las migraciones, constraints y RLS.
#
# Uso:  pnpm probar:migraciones
# Requiere un Postgres local. Se puede apuntar a otro con PGURL_BASE, por ejemplo al de
# `supabase start`:  PGURL_BASE=postgres://postgres:postgres@127.0.0.1:54322/postgres
set -euo pipefail

BASE_URL="${PGURL_BASE:-postgres://postgres@localhost:5432/postgres}"
DB="asistente_ventas_prueba"

psql "$BASE_URL" -v ON_ERROR_STOP=1 -qc "drop database if exists $DB" >/dev/null
psql "$BASE_URL" -v ON_ERROR_STOP=1 -qc "create database $DB" >/dev/null

URL="${BASE_URL%/*}/$DB"
run() { psql "$URL" -v ON_ERROR_STOP=1 -q -f "$1"; }

run supabase/pruebas/00_shim_auth.sql
for m in supabase/migrations/*.sql; do
  echo "  aplicando $(basename "$m")"
  run "$m"
done

shopt -s nullglob
for p in supabase/pruebas/[1-9]*.sql; do
  echo "  probando $(basename "$p")"
  psql "$URL" -v ON_ERROR_STOP=1 -q -f "$p"
done

echo "OK  esquema y pruebas de RLS en verde"
