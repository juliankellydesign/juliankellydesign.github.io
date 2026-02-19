#!/bin/bash
# Setup script for Conductor workspaces
# Usage: ./setup.sh "City Name"
#
# Injects the city name into index.html as a visible tag.
# Idempotent — safe to run multiple times.

CITY="${1:?Usage: ./setup.sh \"City Name\"}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HTML="$SCRIPT_DIR/index.html"

if [ ! -f "$HTML" ]; then
  echo "Error: index.html not found at $HTML"
  exit 1
fi

# Replace the city-tag contents (works whether empty or already populated)
sed -i '' 's|<span id="city-tag">[^<]*</span>|<span id="city-tag">'"$CITY"'</span>|' "$HTML"

echo "Set city to: $CITY"
