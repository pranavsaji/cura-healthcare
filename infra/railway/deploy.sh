#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Turnkey Railway deploy for the Cura API (Fastify + realtime WS + Postgres).
#
# Prereqs: `railway login` (or RAILWAY_TOKEN in env) and a repo-root `.env`
# holding DEEPGRAM_API_KEY + DEEPSEEK_API_KEY. Run from the repo root:
#     bash infra/railway/deploy.sh
#
# Idempotent: re-running re-uses the existing project/service and redeploys.
# Secrets are read from .env and pushed straight to Railway — never printed.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

echo "▸ Checking Railway auth…"
railway whoami >/dev/null 2>&1 || { echo "✗ Not logged in. Run: railway login"; exit 1; }
railway whoami

# 1. Project — link if a .railway link exists, else create one.
if ! railway status >/dev/null 2>&1; then
  echo "▸ Creating Railway project 'cura-api'…"
  railway init --name cura-api
fi

# 2. Postgres — add once (ignore error if it already exists).
echo "▸ Ensuring a Postgres database exists…"
railway add --database postgres 2>/dev/null || echo "  (postgres already present or add skipped)"

# 3. Load secrets from .env WITHOUT echoing them.
set -a; . ./.env; set +a
: "${DEEPGRAM_API_KEY:?DEEPGRAM_API_KEY missing from .env}"
: "${DEEPSEEK_API_KEY:?DEEPSEEK_API_KEY missing from .env}"

# 4. Crypto secrets — generate strong values if not already provided.
ENCRYPTION_KEY="${ENCRYPTION_KEY:-$(openssl rand -hex 24)}"
SESSION_SECRET="${SESSION_SECRET:-$(openssl rand -hex 24)}"

WEB_ORIGIN="${WEB_ORIGIN:-https://cura-web-six.vercel.app}"

echo "▸ Setting service variables…"
railway variables \
  --set "NODE_ENV=production" \
  --set "LLM_PROVIDER=deepseek" \
  --set "LLM_MODEL=${LLM_MODEL:-deepseek-chat}" \
  --set "DEEPSEEK_API_KEY=${DEEPSEEK_API_KEY}" \
  --set "ASR_PROVIDER=deepgram" \
  --set "DEEPGRAM_API_KEY=${DEEPGRAM_API_KEY}" \
  --set "ENCRYPTION_KEY=${ENCRYPTION_KEY}" \
  --set "SESSION_SECRET=${SESSION_SECRET}" \
  --set "WEB_ORIGIN=${WEB_ORIGIN}" \
  --set "AUTH_PROVIDER=mock" \
  --set 'DATABASE_URL=${{Postgres.DATABASE_URL}}'

# 5. Deploy the Dockerfile and wait for the build.
echo "▸ Deploying (this builds the Docker image on Railway)…"
railway up --ci

# 6. Ensure a public domain exists.
echo "▸ Ensuring a public domain…"
railway domain || true

echo "✓ Done. Check the URL above, then hit /health."
