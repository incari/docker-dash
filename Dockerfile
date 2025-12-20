# Multi-stage build for Docker Dashboard using pnpm and Corepack

# Stage 1: Build the React frontend
FROM node:20-alpine AS frontend-builder

# Enable corepack to use pnpm without using npm to install it
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN pnpm install
COPY frontend/ ./
RUN pnpm build

# Stage 2: Final production image
# Using node:22-alpine as it's the current stable major version (24 is not yet released)
FROM node:22-alpine

# Install build-base for native module compilation
RUN apk add --no-cache build-base python3

# Enable corepack for the final image
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app
COPY package*.json ./

# Install backend dependencies with hoisting for better-sqlite3
RUN pnpm install --prod --shamefully-hoist

# Rebuild native modules for the target environment
RUN pnpm rebuild better-sqlite3

# Copy backend source
COPY src ./src

# Copy built frontend from Stage 1
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Create data directory for persistence
RUN mkdir -p /app/data

# Environment defaults
ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/app/data/dashboard.db
ENV UPLOAD_DIR=/app/data/images

# Expose port
EXPOSE 3000

# Health check using new health endpoint
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Run the application
CMD ["node", "src/server.js"]
