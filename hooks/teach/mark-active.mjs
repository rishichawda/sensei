import { markActive } from "./session-state.mjs";

// scripts/mastery.mjs is only ever invoked by the teach skill's own
// protocol (mastery-ledger-protocol.md Section A), so a Bash command
// running it is an unambiguous, structural signal that a teach session's
// probe/plan loop has started — no need to parse Skill tool_input.
const MASTERY_CLI_PATTERN = /scripts\/mastery\.mjs/;

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
  if (typeof command !== "string" || !MASTERY_CLI_PATTERN.test(command)) return;
  if (!payload.transcript_path) return;
  markActive(payload.transcript_path);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
