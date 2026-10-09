import { markTeachInvoked } from "./session-state.mjs";

// The two ways the teach skill is started, both verified in a live session:
// a typed `/sensei:teach ...` reaches UserPromptSubmit as `prompt` and makes
// no Skill tool call; the model's own invocation is a PostToolUse for the Skill
// tool with tool_input.skill "sensei:teach". mark-active.mjs only marks a session
// for enforcement after one of these has happened.
const TYPED_COMMAND = /^\/sensei:teach(?:\s|$)/;
const SKILL_NAME = "sensei:teach";

function startsTeach(payload) {
  if (payload?.hook_event_name === "UserPromptSubmit") {
    return typeof payload.prompt === "string" && TYPED_COMMAND.test(payload.prompt);
  }
  if (payload?.hook_event_name === "PostToolUse") {
    return payload.tool_name === "Skill" && payload.tool_input?.skill === SKILL_NAME;
  }
  return false;
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
  if (!payload?.transcript_path || !startsTeach(payload)) return;
  markTeachInvoked(payload.transcript_path);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
