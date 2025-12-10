#!/bin/bash
# Backup script for Giga LAN Manager tournaments
# Exports each tournament as a separate JSON file

BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
TOURNAMENT_DIR="$BACKUP_DIR/tournaments_$TIMESTAMP"

mkdir -p "$TOURNAMENT_DIR"

echo "🎮 Giga LAN Manager - Tournament Backup"
echo "========================================"

# Get list of tournaments
TOURNAMENTS=$(curl -s http://localhost:3000/api/tournaments)

if [ -z "$TOURNAMENTS" ] || [ "$TOURNAMENTS" = "[]" ]; then
    echo "⚠️  No tournaments found or server not running"
    exit 1
fi

# Save the tournament list
echo "$TOURNAMENTS" > "$TOURNAMENT_DIR/_tournament_list.json"

# Parse tournament IDs and names using bash (no jq needed)
# Extract id and name pairs from JSON array
echo "$TOURNAMENTS" | grep -oP '"id":"[^"]+"|"name":"[^"]+"' | paste - - | while read -r line; do
    ID=$(echo "$line" | grep -oP '"id":"[^"]+' | cut -d'"' -f4)
    NAME=$(echo "$line" | grep -oP '"name":"[^"]+' | cut -d'"' -f4)
    
    if [ -n "$ID" ] && [ -n "$NAME" ]; then
        # Sanitize filename (remove special chars, replace spaces with underscores)
        SAFE_NAME=$(echo "$NAME" | tr ' ' '_' | tr -cd '[:alnum:]_-')
        FILENAME="${SAFE_NAME}.json"
        
        echo "📦 Backing up: $NAME → $FILENAME"
        curl -s "http://localhost:3000/api/tournament/$ID/state" > "$TOURNAMENT_DIR/$FILENAME"
    fi
done

# Count backed up tournaments
COUNT=$(ls -1 "$TOURNAMENT_DIR"/*.json 2>/dev/null | grep -v "_tournament_list" | wc -l)

echo "========================================"
echo "✅ Backed up $COUNT tournaments to: $TOURNAMENT_DIR"
ls -la "$TOURNAMENT_DIR"
