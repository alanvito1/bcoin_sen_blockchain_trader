# Phase 3: Optimized Production Engine
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install system dependencies (Prisma needs openssl)
RUN apk add --no-cache openssl

# Copy package files first to leverage Docker layer caching
COPY package*.json ./

# Install ONLY production dependencies
RUN npm ci --omit=dev

# Copy application source and configuration
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Healthcheck: Ping DB and Redis every 30s
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node src/health.js

# Expose port (Internal Bot UI / Health)
EXPOSE 3000

# Start with migration sync and bot engine
CMD ["npm", "run", "start:prod"]
