#!/bin/bash

# GigaLAN Manager - Start Script
# ================================

set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

echo "🎮 GigaLAN Manager - Starting..."
echo "================================"

# Start Redis via Docker
echo "🐳 Starting Redis..."
if command -v docker &> /dev/null; then
    docker compose up -d redis && {
        echo "✅ Redis started"
        sleep 2
    } || {
        echo "⚠️  Could not start Redis. Make sure Docker is running and you're logged in."
        echo "   Run: docker login"
    }
else
    echo "⚠️  Docker not found. Please install Docker."
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Clear Vite cache to prevent stale builds
echo "🧹 Clearing cache..."
rm -rf node_modules/.vite

# Build the project
echo "🔨 Building the project..."
npm run build

echo ""
echo "✅ Build complete!"
echo ""
echo "================================"
echo "📋 LOG CHECKING COMMANDS:"
echo "================================"
echo ""
echo "  View frontend dev logs:  Check the terminal running 'npm run dev'"
echo "  View server logs:        Check the terminal running 'npm run dev'"
echo "  Docker logs (if using):  docker-compose logs -f"
echo ""
echo "================================"
echo "🚀 STARTING DEVELOPMENT SERVER..."
echo "================================"
echo ""
echo "  Frontend: http://localhost:5173"
echo "  Backend:  http://localhost:3000 (if configured)"
echo ""
echo "  Press Ctrl+C to stop"
echo ""

# Start the development server
npm run dev
