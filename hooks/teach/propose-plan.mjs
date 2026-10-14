import { parseTeachEvent } from "./mastery-record.mjs";
import { validateTeachEvent } from "./validate-teach-event.mjs";
import { storeProposedPlan } from "../../scripts/propose-plan.mjs";

// The teach skill already stored the plan with scripts/propose-plan.mjs when it wrote
// the plan message. The approval question carries the plan again, so store that one too:
// if the learner asked for changes, the question holds the plan they are approving.
export function handlePayload(payload) {
  if (payload?.hook_event_name !== "PreToolUse" || payload?.tool_name !== "AskUserQuestion") return;
  const event = parseTeachEvent(payload.tool_input?.metadata?.source);
  if (event?.kind !== "plan") return;
  if (validateTeachEvent(event, payload.tool_input?.questions).length > 0) return;
  storeProposedPlan(event.topic, event.plan);
}

async function main() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  try {
    handlePayload(JSON.parse(raw));
  } catch {
    // A failure here must never block the question.
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
