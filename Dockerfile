# TongFlow web (Next.js standalone) — multi-stage image.
#
# Both stages use debian-bookworm (glibc). Do NOT switch to alpine/musl: the
# native modules better-sqlite3 and sharp are compiled against glibc in the
# builder and traced into the standalone bundle; loading them under musl crashes.

# ---- Stage 1: builder -------------------------------------------------------
# Full node:20-bookworm ships python3/make/g++ — the toolchain pnpm needs to
# compile the onlyBuiltDependencies (better-sqlite3, sharp, @swc/core, ...).
FROM node:20-bookworm AS builder
WORKDIR /app

# pnpm 10 via corepack (built into Node, no extra install).
RUN corepack enable && corepack prepare pnpm@10 --activate

# Install deps first for layer caching; --frozen-lockfile for reproducibility.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Build. `prebuild` runs `pnpm gen:abi` (needs config/tongflow.abi.json and the
# biome/tsx binaries from node_modules), then `next build` emits .next/standalone.
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# ---- Stage 2: runner --------------------------------------------------------
# Slim runtime + system Python 3.11 (bookworm) for the plugin venv. python3-venv
# + python3-pip are required: first plugin run creates a venv under /data and
# pip-installs the SDK and each plugin's requirements.
FROM node:20-bookworm-slim AS runner
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        python3 python3-venv python3-pip ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    TONGFLOW_DATA_DIR=/data \
    TONGFLOW_PLUGINS_DIR=/plugins \
    TONGFLOW_RESOURCES_DIR=/app \
    PYTHON=python3 \
    NEXT_TELEMETRY_DISABLED=1

# Mirror desktop/scripts/assemble-app.mjs: next only traces node_modules, so the
# runtime fs assets (drizzle migrations, config/, sdk/) must be copied by hand.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/config ./config
COPY --from=builder /app/sdk ./sdk

# /data: SQLite db + uploads + settings.json + plugin venv. /plugins: installed plugins.
VOLUME ["/data", "/plugins"]

EXPOSE 3000
CMD ["node", "server.js"]
