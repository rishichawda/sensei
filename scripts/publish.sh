#!/usr/bin/env bash
# sensei/scripts/publish.sh
set -euo pipefail

if [ $# -ne 2 ]; then
  echo "Usage: publish.sh <rendered.png> <slug>" >&2
  exit 1
fi

RENDERED="$1"
SLUG="$2"

resolve_confined() {
  local label="$1" target="$2" hops=0 resolved dir temp_root
  if [ ! -d "$(dirname "$target")" ]; then
    echo "publish.sh: ${label} directory does not exist: $(dirname "$target")" >&2
    exit 1
  fi
  while [ -L "$target" ] && [ "$hops" -lt 20 ]; do
    resolved="$(readlink "$target")"
    case "$resolved" in
      /*) target="$resolved" ;;
      *) target="$(dirname "$target")/$resolved" ;;
    esac
    hops=$((hops + 1))
  done
  if [ -L "$target" ]; then
    echo "publish.sh: refusing to use ${label} path: symlink chain exceeds 20 hops: $2" >&2
    exit 1
  fi
  dir="$(cd "$(dirname "$target")" && pwd -P)"
  temp_root="$(cd "${TMPDIR:-/tmp}" && pwd -P)"
  case "$dir" in
    "$temp_root"|"$temp_root"/*) : ;;
    *)
      echo "publish.sh: refusing to use ${label} path outside \$TMPDIR (${temp_root}): $2 -> ${dir}/$(basename "$target")" >&2
      exit 1
      ;;
  esac
}

resolve_confined "the source" "$RENDERED"

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
