# syntax=docker/dockerfile:1
# ─────────────────────────────────────────────────────────────────────────────
# Cura API (Fastify + realtime WebSockets + Postgres) container image.
# Build context is the repo ROOT so the pnpm workspace resolves `@cura/*` libs.
# The server is esbuild-bundled into a single `dist/main.js`, so the runtime
# stage needs no node_modules — just Node + the bundle + the SQL migrations.
# ─────────────────────────────────────────────────────────────────────────────

# ── Builder ──────────────────────────────────────────────────────────────────
FROM node:22-bookworm AS builder
WORKDIR /repo

# Corepack pins the exact pnpm from package.json's "packageManager" field.
RUN corepack enable

# Install with the full workspace so cross-package builds resolve.
COPY . .
RUN pnpm install --frozen-lockfile

# Bundle the server (apps/api → apps/api/dist/main.js) and a standalone
# migration runner (libs/db/src/migrate.ts → apps/api/dist/migrate.js). Both are
# single self-contained ESM files with a CJS require shim for interop.
RUN pnpm --filter @cura/api build \
 && pnpm --filter @cura/api exec esbuild ../../libs/db/src/migrate.ts \
      --bundle --platform=node --format=esm \
      --outfile=dist/migrate.js \
      --banner:js="import{createRequire}from'module';const require=createRequire(import.meta.url);"

# ── Runner ───────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# The esbuild bundles use ESM syntax (top-level await); mark the runtime dir as
# ESM so Node parses `dist/*.js` as modules. The build's createRequire banner
# still provides `require` for any bundled CommonJS dependencies.
RUN printf '{"type":"module"}\n' > package.json

# The bundled server + migration runner.
COPY --from=builder /repo/apps/api/dist ./dist
# SQL migrations + drizzle journal — migrate.js reads ./drizzle at runtime.
COPY --from=builder /repo/libs/db/drizzle ./drizzle
# Entrypoint: apply migrations, then start the server.
COPY --from=builder /repo/infra/railway/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

# Railway/PaaS route to $PORT; the app maps it to API_PORT (see apps/api config).
EXPOSE 4100
CMD ["./entrypoint.sh"]
