#!/bin/sh
# Container entrypoint for the Cura API on Railway.
# Runs pending DB migrations against DATABASE_URL, then starts the server.
# `set -e` so a failed migration aborts the boot instead of serving a bad schema.
set -e

echo "[entrypoint] applying database migrations…"
node dist/migrate.js

echo "[entrypoint] starting Cura API…"
exec node dist/main.js
