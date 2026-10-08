import { existsSync, rmSync, writeFileSync } from "node:fs";

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

// Called only when the learner confirms the lesson is over (a `wrap` answered
// "done"). The marker used to be cleared at every Stop, which un-enforced a
// session mid-lesson (commit 6a99a40); this clears it at an explicit end only.
export function clearActive(transcriptPath) {
  rmSync(markerPathFor(transcriptPath), { force: true });
}
