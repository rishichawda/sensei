import { markActive } from "./session-state.mjs";

// scripts/mastery.mjs is only ever *run* by the teach skill's own protocol
// (mastery-ledger-protocol.md Section A), so a Bash command whose program is
// `node <...>/scripts/mastery.mjs` is an unambiguous, structural signal that a
// teach session's probe/plan loop has started — no need to parse Skill
// tool_input. Merely mentioning the path (grep, git diff, cat, a dev reading
// the file) must not count: the marker is never cleared mid-session, so a false
// positive would enforce tagging for the rest of an unrelated session. The
// marker is per-transcript, so it lives exactly as long as the session that
// started the teach protocol.
//
// Matches `node` as the command (start of a line or after ; & |, after any `VAR=val`
// prefixes and node flags) whose first non-flag argument is the script path,
// quoted or not.
const MASTERY_CLI_PATTERN = new RegExp(
  String.raw`(?:^|[;&|\n])\s*` +
    String.raw`(?:[A-Za-z_]\w*=\S*\s+)*` +
    String.raw`node\s+(?:-\S+\s+)*` +
    String.raw`(?:"[^"]*|'[^']*|[^\s"']*)scripts/mastery\.mjs["']?(?:\s|$)`,
);

export function isMasteryInvocation(command) {
  return MASTERY_CLI_PATTERN.test(command);
}

async function main() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return;
  }
  if (payload?.hook_event_name !== "PostToolUse" || payload?.tool_name !== "Bash") return;
  const command = payload.tool_input?.command;
  if (typeof command !== "string" || !isMasteryInvocation(command)) return;
  if (!payload.transcript_path) return;
  markActive(payload.transcript_path);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
