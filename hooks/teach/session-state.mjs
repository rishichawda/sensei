import { existsSync, writeFileSync } from "node:fs";

// Per-session marker, sibling to this session's own transcript file — the
// same scoping trick hooks/md-log/lib.mjs uses for its state file, so it's
// inherently scoped to one session (never stale across sessions) and
// harmless to leave behind (orphaned alongside an orphaned transcript).
function markerPathFor(transcriptPath) {
  return `${transcriptPath}.teach-active-state.json`;
}

export function markActive(transcriptPath) {
  writeFileSync(markerPathFor(transcriptPath), JSON.stringify({ active: true }), "utf8");
}

export function isActive(transcriptPath) {
  return existsSync(markerPathFor(transcriptPath));
}
