import { parseTeachEvent } from "./mastery-record.mjs";
import { isActive } from "./session-state.mjs";
import { validateTeachEvent } from "./validate-teach-event.mjs";

const MISSING_TAG_REASON =
  'This AskUserQuestion call is missing the teach ledger tag required on every question during an active teach session (see mastery-ledger-protocol.md). Retry the exact same call with metadata.source attached: use {app:"sensei-teach", v:1, kind:"probe", topic:"<topic>", correct:"<exact correct label>"} for a Phase 1b probe, {app:"sensei-teach", v:1, kind:"goal", topic:"<topic>", goal:"<their goal>"} for the goal-concretizing call (never to confirm a stored goal: it starts a new session), {app:"sensei-teach", v:1, kind:"node", topic:"<topic>", node:"<node-id>", recordAs:"graded", correct:"<exact correct label>"} for a Phase 3 quiz-check, {app:"sensei-teach", v:1, kind:"plan", topic:"<topic>", plan:{...}, approve:"<exact label of the approval option>"} for the plan-approval call, {app:"sensei-teach", v:1, kind:"wrap", topic:"<topic>", done:"<exact label of the done option>"} for the end-of-lesson check, or {app:"sensei-teach", v:1, kind:"other"} (topic optional) for anything else — topic disambiguation, Phase 1a\'s interim narrowing calls.';

function deny(reason) {
  return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } };
}

export function checkDeny(payload) {
  if (payload?.hook_event_name !== "PreToolUse" || payload?.tool_name !== "AskUserQuestion") return null;

  const event = parseTeachEvent(payload.tool_input?.metadata?.source);
  if (event) {
    const problems = validateTeachEvent(event, payload.tool_input?.questions);
    if (problems.length === 0) return null;
    return deny(`This AskUserQuestion call has a malformed sensei-teach tag: ${problems.join("; ")}. Fix the tag and retry the same call.`);
  }

  if (!payload.transcript_path || !isActive(payload.transcript_path)) return null;
  return deny(MISSING_TAG_REASON);
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
