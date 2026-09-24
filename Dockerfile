# syntax=docker/dockerfile:1
# ==============================================================================
# iris-sync — Standalone Headless InterSystems IRIS Compiler & Sync Engine
# Multi-stage Container Image (ghcr.io/g3labz/iris-sync)
# ==============================================================================

# --- Stage 1: Build CLI bundle from source ---
FROM node:20-alpine AS builder

WORKDIR /src

# Copy dependency manifests
COPY package.json package-lock.json ./

# Install development dependencies for build
RUN npm ci --ignore-scripts

# Copy source tree and build configurations
COPY tsconfig.json tsconfig.base.json ./
COPY build/ ./build/
COPY src/ ./src/
COPY schemas/ ./schemas/

# Build standalone headless CLI bundle
RUN npm run build:cli

# --- Stage 2: Minimal runtime image ---
FROM node:20-alpine AS runner

LABEL org.opencontainers.image.title="iris-sync" \
      org.opencontainers.image.description="Standalone Headless InterSystems IRIS Synchronization & Compiler Engine" \
      org.opencontainers.image.vendor="G3Labz" \
      org.opencontainers.image.url="https://github.com/G3Labz/vscode-objectscript" \
      org.opencontainers.image.source="https://github.com/G3Labz/vscode-objectscript" \
      org.opencontainers.image.licenses="MIT"

# Install git, curl, ca-certificates for repository synchronization
RUN apk add --no-cache git curl ca-certificates bash

WORKDIR /app

# Copy the bundled CLI script and schemas
COPY --from=builder /src/dist/cli/iris-sync.js /app/iris-sync.js
COPY --from=builder /src/schemas /app/schemas

# Create executable runner script in system PATH
RUN printf '#!/bin/sh\nexec node /app/iris-sync.js "$@"\n' > /usr/local/bin/iris-sync \
    && chmod +x /usr/local/bin/iris-sync

# Create unprivileged working directory for mounted projects
WORKDIR /workspace

ENV NODE_ENV=production

ENTRYPOINT ["iris-sync"]
CMD ["--help"]
