# Multi-stage build for Docker Dashboard using Bun and pnpm

# Stage 1: Build the React frontend with Bun
FROM oven/bun:alpine AS frontend-builder

WORKDIR /app/frontend
COPY frontend/package.json frontend/bun.lock* ./
RUN bun install --frozen-lockfile || bun install
COPY frontend/ ./
RUN bun run build

# Stage 2: Final production image
# IMPORTANT: Use Node 22 (LTS). Node 24 is unstable for native modules like better-sqlite3.
FROM node:22-alpine

# Labels for GitHub Container Registry
LABEL org.opencontainers.image.source=https://github.com/incari/docker-dashboard
LABEL org.opencontainers.image.description="Docker Dashboard - A web UI for managing Docker containers"
LABEL org.opencontainers.image.licenses=MIT

# Install build-base for native module compilation
RUN apk add --no-cache build-base python3
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app
COPY package*.json ./

# Force better-sqlite3 to compile from source inside the container
ENV npm_config_build_from_source=true

# Install production dependencies only
RUN pnpm install --prod --shamefully-hoist

# Explicitly rebuild better-sqlite3 for Alpine Linux (this compiles the native module)
RUN cd node_modules/better-sqlite3 && npm run build-release

# Copy backend source
COPY src ./src

# Copy built frontend from Stage 1
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist


# Create data directory
RUN mkdir -p /app/data

# Environment defaults
ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/app/data/dashboard.db
ENV UPLOAD_DIR=/app/data/images

EXPOSE 3000

# Health check using new health endpoint
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Run the application
CMD ["node", "src/server.js"]
