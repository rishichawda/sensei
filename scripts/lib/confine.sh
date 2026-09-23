# sensei/scripts/lib/confine.sh
# Shared path-resolution helper used by scripts that write untrusted output
# paths: bounds symlink hops, re-checks the resolved directory exists, and
# confines the final path to $TMPDIR.

resolve_confined() {
  local label="$1" target="$2" prefix="$3" hops=0 resolved dir temp_root
  if [ ! -d "$(dirname "$target")" ]; then
    echo "${prefix}: ${label} directory does not exist: $(dirname "$target")" >&2
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
    echo "${prefix}: refusing to use ${label} path: symlink chain exceeds 20 hops: $2" >&2
    exit 1
  fi
  if [ ! -d "$(dirname "$target")" ]; then
    echo "${prefix}: ${label} directory does not exist after symlink resolution: $(dirname "$target")" >&2
    exit 1
  fi
  dir="$(cd "$(dirname "$target")" && pwd -P)"
  temp_root="$(cd "${TMPDIR:-/tmp}" && pwd -P)"
  case "$dir" in
    "$temp_root"|"$temp_root"/*) : ;;
    *)
      echo "${prefix}: refusing to use ${label} path outside \$TMPDIR (${temp_root}): $2 -> ${dir}/$(basename "$target")" >&2
      exit 1
      ;;
  esac
}
