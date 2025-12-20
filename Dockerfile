# Multi-stage build for Docker Dashboard using pnpm and Corepack

# Stage 1: Build the React frontend
FROM node:22-alpine AS frontend-builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN pnpm install
COPY frontend/ ./
RUN pnpm build

# Stage 2: Final production image
# IMPORTANT: Use Node 22 (LTS). Node 24 is unstable for native modules like better-sqlite3.
FROM node:22-alpine

# Install build-base for native module compilation (keep these for runtime)
RUN apk add --no-cache build-base python3
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app
COPY package*.json ./

# Force better-sqlite3 to compile from source inside the container
ENV npm_config_build_from_source=true

# Install ALL dependencies first (including devDependencies for building native modules)
RUN pnpm install --shamefully-hoist

# Rebuild better-sqlite3 to ensure it's compiled for Alpine Linux
RUN pnpm rebuild better-sqlite3

# Remove devDependencies after building native modules
RUN pnpm prune --prod

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
