#!/bin/bash

# Blockchain Trader - Restart & Update Script
# Usage: ./restart.sh

echo "🚀 [Update] Starting system update and restart..."

# 1. Build and restart Docker containers
echo "📦 [Docker] Rebuilding and starting containers (detached)..."
docker-compose up -d --build

# 2. Synchronize Database Schema
echo "🗄️ [Database] Synchronizing Prisma migrations..."
docker-compose exec bot npx prisma migrate deploy


# 4. Success check
if [ $? -eq 0 ]; then
  echo "✅ [SUCCESS] Deployment complete. System is online."
  echo "💡 Tip: Use 'docker-compose logs -f' to monitor real-time execution."
else
  echo "❌ [ERROR] Deployment failed during migrations."
fi

# 5. Cleanup dangling images
docker image prune -f
