# Multi-stage build for Docker Dashboard using pnpm

# Stage 1: Build the React frontend
FROM node:22-alpine AS frontend-builder
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY customIconMappings.json ./
WORKDIR /app/frontend
COPY frontend/package.json frontend/pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile || pnpm install
COPY frontend/ ./
RUN pnpm build

# Stage 2: Build backend with native modules (better-sqlite3)
FROM node:22-alpine AS backend-builder
# Install build tools (only needed in this stage, not in final image)
# Update package index and install with retry logic
RUN apk update && apk add --no-cache build-base python3
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY package*.json ./
COPY pnpm-lock.yaml* ./
ENV npm_config_build_from_source=true
# Install ALL dependencies (including devDependencies for TypeScript compilation)
RUN pnpm install --frozen-lockfile || pnpm install
# Compile better-sqlite3 native module
RUN cd node_modules/better-sqlite3 && npm run build-release
# Copy TypeScript source and compile
COPY src ./src
RUN pnpm run build:backend
# Now prune devDependencies for production
RUN pnpm prune --prod
# Clean up unnecessary files to reduce size (ignore errors for missing paths)
RUN rm -rf node_modules/better-sqlite3/deps \
    node_modules/better-sqlite3/src \
    node_modules/better-sqlite3/build/Release/.deps \
    node_modules/better-sqlite3/build/Release/obj.target \
    2>/dev/null || true

# Stage 3: Final minimal production image (NO build tools)
FROM node:22-alpine

# Labels for GitHub Container Registry
LABEL org.opencontainers.image.source=https://github.com/incari/docker-dash
LABEL org.opencontainers.image.description="Docker Dashboard - A web UI for managing Docker containers"
LABEL org.opencontainers.image.licenses=MIT

WORKDIR /app

# Copy pre-built node_modules (with compiled native modules)
COPY --from=backend-builder /app/node_modules ./node_modules
COPY package*.json ./

# Copy custom icon mappings (shared between backend and frontend)
COPY customIconMappings.json ./

# Copy compiled backend (from TypeScript build)
# Backend files: server.js, config/, routes/, database/, types/, utils/
COPY --from=backend-builder /app/dist ./dist

# Copy built frontend to the same dist/ folder (files don't conflict)
# Frontend files: index.html, assets/, manifest.json, sw.js, etc.
# The server at dist/server.js looks for frontend at path.join(__dirname, "../dist") = /app/dist
COPY --from=frontend-builder /app/frontend/dist ./dist

# Create data directory
RUN mkdir -p /app/data

# Environment defaults
ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/app/data/dashboard.db
ENV UPLOAD_DIR=/app/data/images

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["node", "dist/server.js"]
