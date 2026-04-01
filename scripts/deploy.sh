#!/bin/bash
# 🚀 Deployment script for VPS

# Step 1: Update code
echo "Pulling latest code from live-production branch..."
git fetch origin
git reset --hard origin/live-production

# Step 2: Build and restart containers using production config
echo "Restarting containers..."
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d --build

# Step 3: Run Prisma migrations (if any)
# This Step is already in the docker-compose command, 
# but we can call it manually to verify.
# echo "Running Prisma migrations..."
# docker exec trader-engine npx prisma migrate deploy

echo "✅ Deployment successful! Run 'docker logs -f trader-engine' to monitor logs."
