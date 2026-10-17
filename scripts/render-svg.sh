#!/usr/bin/env bash
set -euo pipefail

if [ $# -ne 2 ]; then
  echo "Usage: render-svg.sh <src.svg> <out.png>" >&2
  exit 1
fi

SRC="$1"
OUT="$2"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

source "${SCRIPT_DIR}/lib/confine.sh"

resolve_confined "the source" "$SRC" "render-svg.sh"
resolve_confined "the output" "$OUT" "render-svg.sh"

if [ ! -f "$SRC" ]; then
  echo "render-svg.sh: source file not found: $SRC" >&2
  exit 1
fi

TIMEOUT_CMD=""
if command -v timeout >/dev/null 2>&1; then
  TIMEOUT_CMD="timeout 60"
elif command -v gtimeout >/dev/null 2>&1; then
  TIMEOUT_CMD="gtimeout 60"
fi

if [ ! -d "${PLUGIN_ROOT}/node_modules/@resvg/resvg-js" ]; then
  echo "render-svg.sh: @resvg/resvg-js not found — run 'npm install' in ${PLUGIN_ROOT}" >&2
  exit 1
fi

set +e
RENDER_ERR=$($TIMEOUT_CMD node "${SCRIPT_DIR}/lib/svg-to-png.mjs" "$SRC" "$OUT" 2>&1)
CODE=$?
set -e

if [ "$CODE" -ne 0 ] || [ ! -f "$OUT" ]; then
  rm -f "$OUT"
  echo "SVG render FAILED." >&2
  echo "$RENDER_ERR" | tail -n 15 >&2
  exit 1
fi

SIZE=$(wc -c < "$OUT" | tr -d ' ')
if [ "$SIZE" -gt 512000 ]; then
  echo "WARNING: output exceeds 500KB (${SIZE} bytes) — Claude Code will recompress before viewing, consider simplifying the picture" >&2
fi

echo "Rendered: ${OUT}"
