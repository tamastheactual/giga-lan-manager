#!/bin/bash

# GigaLAN Manager - Stop Script
# ================================

set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

echo "🎮 GigaLAN Manager - Stopping..."
echo "================================"

# Run backup before stopping
echo "💾 Creating backup before shutdown..."
if [ -f "$PROJECT_DIR/backup.sh" ]; then
    "$PROJECT_DIR/backup.sh"
    echo ""
else
    echo "⚠️  backup.sh not found, skipping backup"
fi

# Stop all containers via Docker Compose
echo "🐳 Stopping containers..."
if command -v docker &> /dev/null; then
    docker compose down && {
        echo "✅ All containers stopped"
    } || {
        echo "⚠️  Could not stop containers"
    }
else
    echo "⚠️  Docker not found"
fi

echo ""
echo "✅ GigaLAN Manager stopped!"
