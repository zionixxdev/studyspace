# syntax=docker/dockerfile:1
# ---------------------------------------------------------------------------
# StudySpace — single-container deployment.
#
# Builds the shared package, the API and the SPA, then runs one Node process
# that serves the API under /api/v1 and the built frontend for everything else.
# One image, one URL, no CORS to configure.
#
# No secrets are baked in. The SPA fetches its public Supabase config from
# GET /api/v1/config at runtime, so this image is portable across environments.
# ---------------------------------------------------------------------------

# ---- build -----------------------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /app

# Install dependencies first so this layer caches across source changes.
COPY package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm install --no-audit --no-fund

COPY . .
RUN npm run build

# ---- runtime ---------------------------------------------------------------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Production dependencies only.
COPY package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force

# Build artifacts from the build stage.
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/web/dist ./apps/web/dist

ENV PORT=8787
EXPOSE 8787

# The platform's "does it respond" check hits the root; this hits the API.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" || exit 1

CMD ["node", "apps/api/dist/index.js"]
