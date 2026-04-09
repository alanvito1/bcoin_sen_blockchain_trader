# Phase 3: Optimized Production Engine
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install system dependencies (Prisma needs openssl)
RUN apk add --no-cache openssl

# Copy package files first to leverage Docker layer caching
COPY package*.json ./

# Install dependencies (use npm install for better resilience on VPS)
RUN npm install --omit=dev --network-timeout=100000

# Copy the rest of the application code
COPY . .

# Generate Prisma Client (needs to happen after copying the schema)
RUN npx prisma generate

# Expose port (Internal Bot UI / Health)
EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD node src/health.js

# Start with migration sync and bot engine
CMD ["npm", "run", "start:prod"]
