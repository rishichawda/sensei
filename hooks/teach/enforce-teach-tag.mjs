import { parseTeachEvent } from "./mastery-record.mjs";
import { isActive } from "./session-state.mjs";

export function checkDeny(payload) {
  if (payload?.hook_event_name !== "PreToolUse" || payload?.tool_name !== "AskUserQuestion") return null;
  if (!payload.transcript_path || !isActive(payload.transcript_path)) return null;
  const event = parseTeachEvent(payload.tool_input?.metadata?.source);
  if (event) return null;

  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason:
        'This AskUserQuestion call is missing the teach ledger tag required on every question during an active teach session (see mastery-ledger-protocol.md). Retry the exact same call with metadata.source attached: use {app:"sensei-teach", v:1, kind:"probe", topic:"<topic>"} for a Phase 1a probe, {app:"sensei-teach", v:1, kind:"goal", topic:"<topic>", goal:"<their goal>"} for the goal-concretizing call, {app:"sensei-teach", v:1, kind:"node", topic:"<topic>", node:"<node-id>", recordAs:"graded", correct:"<exact correct label>"} for a Phase 3 quiz-check, {app:"sensei-teach", v:1, kind:"plan", topic:"<topic>", plan:{...}} for the plan-approval call, or {app:"sensei-teach", v:1, kind:"other"} (topic optional) for anything else — topic disambiguation, Phase 1b\'s interim narrowing calls.',
    },
  };
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
  const decision = checkDeny(payload);
  if (decision) process.stdout.write(JSON.stringify(decision));
}

if (import.meta.url === `file://${process.argv[1]}`) main();
