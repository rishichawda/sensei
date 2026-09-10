import { parseTeachEvent } from "./mastery-record.mjs";
import { isActive } from "./session-state.mjs";

// quiz-protocol.md step 3 mandates a literal "I don't know" option on every
// single quiz-protocol call, without exception — and Phase 1b's goal
// questions and other plain AskUserQuestion calls are explicitly forbidden
// from using the quiz protocol at all (SKILL.md: "never the quiz
// protocol"). So this exact label is a structural fingerprint: any call
// carrying it is a quiz-protocol call (a Phase 1a probe or a Phase 3
// quiz-check), full stop — no session-state guess needed for *that* part.
const IDK_LABEL = "I don't know";

export function isQuizProtocolCall(toolInput) {
  const questions = Array.isArray(toolInput?.questions) ? toolInput.questions : [];
  return questions.some((q) => Array.isArray(q?.options) && q.options.some((o) => o?.label === IDK_LABEL));
}

export function checkDeny(payload) {
  if (payload?.hook_event_name !== "PreToolUse" || payload?.tool_name !== "AskUserQuestion") return null;
  if (!isQuizProtocolCall(payload.tool_input)) return null;
  // Scoping guard: only enforce inside a session that's actually run teach's
  // ledger CLI, so an unrelated skill elsewhere that happens to also use an
  // "I don't know" option is never affected.
  if (!payload.transcript_path || !isActive(payload.transcript_path)) return null;
  const event = parseTeachEvent(payload.tool_input?.metadata?.source);
  if (event) return null;

  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason:
        'This AskUserQuestion call has an "I don\'t know" option, which marks it as a quiz-protocol call inside an active teach session (mastery-ledger-protocol.md), but its metadata is missing the ledger tag quiz-protocol.md step 4b requires. Retry the exact same call with metadata.source attached: use {app:"sensei-teach", v:1, kind:"probe", topic:"<topic>"} for a Phase 1a probe or any ungraded check, or {app:"sensei-teach", v:1, kind:"node", topic:"<topic>", node:"<node-id>", recordAs:"graded", correct:"<exact correct label>"} only if this is a formal Phase 3 quiz-check for an already-planned node. When in doubt, use the "probe" shape — it never claims mastery it hasn\'t confirmed.',
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
