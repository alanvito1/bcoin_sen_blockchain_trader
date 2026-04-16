#!/bin/bash

# --- Blockchain Trader Operations Script ---
# Phase 3: Production Engine

set -e

# Help message
function show_help() {
  echo "Usage: ./deploy.sh [command]"
  echo ""
  echo "Commands:"
  echo "  build    Build/Rebuild the Docker production image"
  echo "  up       Start the full stack (Bot, DB, Redis) in detached mode"
  echo "  down     Stop and remove all containers"
  echo "  logs     Show real-time logs for the bot engine"
  echo "  status   Check container health and status"
  echo "  clean    Remove unused volumes and images"
  echo "  migrate  Run Prisma migrations manually"
}

case "$1" in
  build)
    echo "🏗️ Building Production Image..."
    docker-compose build --no-cache
    ;;
  up)
    echo "🚀 Starting Stack..."
    docker-compose up -d
    echo "✅ Containers are starting. Use './deploy.sh status' to check health."
    ;;
  down)
    echo "🛑 Stopping Stack..."
    docker-compose down
    ;;
  logs)
    docker-compose logs -f bot-engine
    ;;
  status)
    echo "📊 Container Status:"
    docker-compose ps
    echo ""
    echo "🏥 Healthcheck Status (Bot Engine):"
    docker inspect --format='{{json .State.Health}}' trader-engine | python3 -m json.tool || echo "Waiting for healthcheck to run..."
    ;;
  migrate)
    echo "🔄 Running Migrations..."
    docker exec -it trader-engine npx prisma migrate deploy
    ;;
  clean)
    echo "🧹 Cleaning up..."
    docker system prune -f
    ;;
  *)
    show_help
    exit 1
    ;;
esac
