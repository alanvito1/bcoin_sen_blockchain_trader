#!/bin/bash

# Blockchain Trader - Deploy Script
# Best for VPS or Railway

echo "🚀 Starting Deployment..."

# 1. Pull latest code
# git pull origin main

# 2. Build and restart containers
docker-compose up -d --build

# 3. DB Migrations
docker-compose exec bot npx prisma migrate deploy

# 4. Cleanup
docker image prune -f

echo "✅ [SUCCESS] Application is online."
