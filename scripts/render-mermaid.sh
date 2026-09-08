#!/usr/bin/env bash
# sensei/scripts/render-mermaid.sh
set -euo pipefail

if [ $# -ne 2 ]; then
  echo "Usage: render-mermaid.sh <src.mmd> <out.png>" >&2
  exit 1
fi

SRC="$1"
OUT="$2"

resolve_confined() {
  local label="$1" target="$2" hops=0 resolved dir temp_root
  if [ ! -d "$(dirname "$target")" ]; then
    echo "render-mermaid.sh: ${label} directory does not exist: $(dirname "$target")" >&2
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
  dir="$(cd "$(dirname "$target")" && pwd -P)"
  temp_root="$(cd "${TMPDIR:-/tmp}" && pwd -P)"
  case "$dir" in
    "$temp_root"|"$temp_root"/*) : ;;
    *)
      echo "render-mermaid.sh: refusing to use ${label} path outside \$TMPDIR (${temp_root}): $2 -> ${dir}/$(basename "$target")" >&2
      exit 1
      ;;
  esac
}

resolve_confined "the source" "$SRC"
resolve_confined "the output" "$OUT"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
MMDC="${PLUGIN_ROOT}/node_modules/.bin/mmdc"

if [ ! -x "$MMDC" ]; then
  echo "render-mermaid.sh: mmdc not found at ${MMDC} — run 'npm install' in ${PLUGIN_ROOT}" >&2
  exit 1
fi

CHROME=""
for candidate in \
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  "/Applications/Chromium.app/Contents/MacOS/Chromium"; do
  if [ -x "$candidate" ]; then
    CHROME="$candidate"
    break
  fi
done

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

CONFIG="${WORKDIR}/puppeteer.json"
if [ -n "$CHROME" ]; then
  printf '{"executablePath": "%s", "args": ["--no-sandbox"]}' "$CHROME" > "$CONFIG"
else
  printf '{"args": ["--no-sandbox"]}' > "$CONFIG"
fi

export PUPPETEER_SKIP_DOWNLOAD=true

TIMEOUT_CMD=""
if command -v timeout >/dev/null 2>&1; then
  TIMEOUT_CMD="timeout 120"
elif command -v gtimeout >/dev/null 2>&1; then
  TIMEOUT_CMD="gtimeout 120"
fi

set +e
$TIMEOUT_CMD "$MMDC" -i "$SRC" -o "$OUT" -p "$CONFIG" -s 2 -b white \
  > "${WORKDIR}/stdout.log" 2> "${WORKDIR}/stderr.log"
CODE=$?
set -e

if [ "$CODE" -ne 0 ] || [ ! -f "$OUT" ]; then
  rm -f "$OUT"
  echo "Mermaid render FAILED — no image produced. Fix the source and re-render." >&2
  tail -n 30 "${WORKDIR}/stderr.log" "${WORKDIR}/stdout.log" >&2 2>/dev/null || true
  exit 1
fi

SIZE=$(wc -c < "$OUT" | tr -d ' ')
if [ "$SIZE" -gt 512000 ]; then
  echo "WARNING: output exceeds 500KB (${SIZE} bytes) — Claude Code will recompress before viewing, consider simplifying the diagram" >&2
fi

echo "Rendered: ${OUT}"
