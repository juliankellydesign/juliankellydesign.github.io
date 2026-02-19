#!/bin/bash
# Conductor setup script — runs automatically when a workspace is created.
# Injects the workspace city name into index.html.
# Idempotent — safe to run multiple times.

# Use $CONDUCTOR_WORKSPACE_NAME (e.g. "freetown-v1"), strip -v<N> suffix, title-case
NAME="${CONDUCTOR_WORKSPACE_NAME:-$(basename "$(pwd)")}"
CITY_RAW=$(echo "$NAME" | sed 's/-v[0-9]*$//')
CITY=$(echo "$CITY_RAW" | sed 's/-/ /g' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) tolower(substr($i,2))}1')

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HTML="$SCRIPT_DIR/index.html"

if [ ! -f "$HTML" ]; then
  echo "Error: index.html not found at $HTML"
  exit 1
fi

# Replace the city-tag contents (works whether empty or already populated)
sed -i '' 's|<span id="city-tag">[^<]*</span>|<span id="city-tag">'"$CITY"'</span>|' "$HTML"

echo "Set city to: $CITY"
