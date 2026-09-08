#!/bin/bash
# Backup script for Giga LAN Manager tournaments.
# Exports each tournament's full state as a separate JSON file, ready to feed
# back through the "Import" button in the lobby.
set -euo pipefail

API="${API:-http://localhost:3000/api}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
TOURNAMENT_DIR="$BACKUP_DIR/tournaments_$TIMESTAMP"

echo "🎮 Giga LAN Manager - Tournament Backup"
echo "========================================"

if ! command -v node >/dev/null 2>&1; then
    echo "❌ node is required (it parses the JSON index)." >&2
    exit 1
fi

TOURNAMENTS=$(curl -sf "$API/tournaments") || {
    echo "⚠️  Could not reach the server at $API" >&2
    exit 1
}

if [ -z "$TOURNAMENTS" ] || [ "$TOURNAMENTS" = "[]" ]; then
    echo "⚠️  No tournaments found"
    exit 0
fi

mkdir -p "$TOURNAMENT_DIR"
printf '%s' "$TOURNAMENTS" > "$TOURNAMENT_DIR/_tournament_list.json"

# Parse the index with a real JSON parser. The previous version grepped "id" and
# "name" out of the raw text and paired alternate lines with `paste`, which
# silently desynchronised every subsequent file as soon as a tournament name
# contained either substring.
COUNT=0
while IFS=$'\t' read -r ID NAME; do
    [ -n "$ID" ] || continue
    SAFE_NAME=$(printf '%s' "$NAME" | tr ' ' '_' | tr -cd '[:alnum:]_-')
    [ -n "$SAFE_NAME" ] || SAFE_NAME="$ID"
    echo "📦 Backing up: $NAME → ${SAFE_NAME}.json"
    curl -sf "$API/tournament/$ID/state" > "$TOURNAMENT_DIR/${SAFE_NAME}.json"
    COUNT=$((COUNT + 1))
done < <(printf '%s' "$TOURNAMENTS" | node -e '
    let raw = "";
    process.stdin.on("data", (c) => (raw += c));
    process.stdin.on("end", () => {
        for (const t of JSON.parse(raw)) {
            process.stdout.write(`${t.id}\t${String(t.name).replace(/[\t\n\r]/g, " ")}\n`);
        }
    });
')

echo "========================================"
echo "✅ Backed up $COUNT tournaments to: $TOURNAMENT_DIR"
