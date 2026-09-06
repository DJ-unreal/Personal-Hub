# syntax=docker/dockerfile:1
#
# Personal Hub — production image.
#
# Dependencies are installed and the app is built INSIDE the image. That is
# not incidental: `@node-rs/argon2` and `sharp` ship platform-specific native
# binaries, so a build produced on a Windows or macOS host cannot run here.
# `.dockerignore` keeps any host-built `node_modules` / `.next` out of the
# build context for the same reason.
#
# Debian slim (glibc) rather than Alpine (musl) — the native modules have
# prebuilt glibc binaries, which avoids a compile toolchain in the image.
#
# Node 24+ is REQUIRED: the data layer uses the built-in `node:sqlite`.

# ---------- deps ----------
FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---------- builder ----------
FROM node:24-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# No secrets are needed at build time — every secret is read lazily at
# request time, so none get baked into the image.
RUN npm run build

# ---------- runner ----------
FROM node:24-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    HUB_DATA_DIR=/data \
    HEALTH_DOCS_DIR=/health-docs

# Run as a non-root user. `node` (uid 1000) already exists in the base image.
RUN mkdir -p /data /health-docs && chown -R node:node /data

# The standalone bundle carries only the node_modules it actually needs.
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public

USER node
EXPOSE 3000

# The SQLite database and the health documents are mounted, never baked in.
VOLUME ["/data"]

CMD ["node", "server.js"]
