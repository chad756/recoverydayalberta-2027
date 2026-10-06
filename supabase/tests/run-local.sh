#!/usr/bin/env bash
# Test the migrations on a local Postgres (developer use only).
set -eo pipefail
cd "$(dirname "$0")/.."
sudo -u postgres psql -qc "drop database if exists rda" -c "create database rda"
for f in tests/supabase-stub.sql migrations/0*.sql tests/rls-test.sql; do
  [ -f "$f" ] || continue
  echo "== $f"
  sudo -u postgres psql -q -v ON_ERROR_STOP=1 -d rda -f "$f" 2>&1 | grep -E 'ok -|FAILED|ERROR|PASSED' || true
done
