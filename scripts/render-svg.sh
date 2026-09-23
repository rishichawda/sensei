#!/usr/bin/env bash
set -euo pipefail

# rsvg-convert commonly lives under MacPorts /opt/local/bin, magick under
# /usr/local/bin or Homebrew's /opt/homebrew/bin — a thin inherited PATH from
# the calling agent's Bash tool might not include these.
export PATH="/opt/local/bin:/usr/local/bin:/opt/homebrew/bin:$PATH"

if [ $# -ne 2 ]; then
  echo "Usage: render-svg.sh <src.svg> <out.png>" >&2
  exit 1
fi

SRC="$1"
OUT="$2"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

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

RSVG_ERR=""
RSVG_CODE=127
if command -v rsvg-convert >/dev/null 2>&1; then
  set +e
  RSVG_ERR=$($TIMEOUT_CMD rsvg-convert -z 2 "$SRC" -o "$OUT" 2>&1)
  RSVG_CODE=$?
  set -e
fi

if [ "$RSVG_CODE" -ne 0 ] || [ ! -f "$OUT" ]; then
  MAGICK_ERR=""
  MAGICK_CODE=127
  if command -v magick >/dev/null 2>&1; then
    set +e
    MAGICK_ERR=$($TIMEOUT_CMD magick -density 192 -background white "$SRC" "$OUT" 2>&1)
    MAGICK_CODE=$?
    set -e
  fi

  if [ "$MAGICK_CODE" -ne 0 ] || [ ! -f "$OUT" ]; then
    rm -f "$OUT"
    echo "SVG render FAILED (tried rsvg-convert then magick)." >&2
    echo "--- rsvg-convert ---" >&2
    echo "${RSVG_ERR:-not installed}" | tail -n 15 >&2
    echo "--- magick ---" >&2
    echo "${MAGICK_ERR:-not installed}" | tail -n 15 >&2
    exit 1
  fi
fi

SIZE=$(wc -c < "$OUT" | tr -d ' ')
if [ "$SIZE" -gt 512000 ]; then
  echo "WARNING: output exceeds 500KB (${SIZE} bytes) — Claude Code will recompress before viewing, consider simplifying the picture" >&2
fi

echo "Rendered: ${OUT}"
