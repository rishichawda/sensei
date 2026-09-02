#!/usr/bin/env bash
# sensei/scripts/publish.sh
set -euo pipefail

if [ $# -ne 2 ]; then
  echo "Usage: publish.sh <rendered.png> <slug>" >&2
  exit 1
fi

RENDERED="$1"
SLUG="$2"

if [ ! -f "$RENDERED" ]; then
  echo "publish.sh: rendered file not found: $RENDERED" >&2
  exit 1
fi

CLEAN_SLUG=$(printf '%s' "$SLUG" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//')
if [ -z "$CLEAN_SLUG" ]; then
  CLEAN_SLUG="viz"
fi

FILES_DIR="$(pwd)/viz"
mkdir -p "$FILES_DIR"

# Portable unique-enough suffix (macOS `date` has no %3N millisecond format).
UNIQUE="$(date +%s)$RANDOM"
FILENAME="viz-${CLEAN_SLUG}-${UNIQUE}.png"
DEST="${FILES_DIR}/${FILENAME}"

cp "$RENDERED" "$DEST"

echo "filename: ${FILENAME}"
echo "path: ${DEST}"
