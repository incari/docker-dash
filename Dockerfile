# Multi-stage build for Docker Dashboard using pnpm

# Stage 1: Build the React frontend
FROM node:20-alpine AS frontend-builder

# Install pnpm
RUN npm install -g pnpm

WORKDIR /app/frontend
COPY frontend/package*.json ./
# Note: If you have pnpm-lock.yaml in the repo, copy it too
# COPY frontend/pnpm-lock.yaml ./ 

RUN pnpm install
COPY frontend/ ./
RUN pnpm build

# Stage 2: Final production image
FROM node:20-alpine

# Install pnpm and build dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++ && \
    npm install -g pnpm

WORKDIR /app

# Copy root package files
COPY package*.json ./
# COPY pnpm-lock.yaml ./

# Install backend dependencies
RUN pnpm install --prod

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

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/containers || exit 1

# Run the application
CMD ["node", "src/server.js"]
