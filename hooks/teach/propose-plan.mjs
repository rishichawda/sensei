import { parseTeachEvent } from "./mastery-record.mjs";
import { validateTeachEvent } from "./validate-teach-event.mjs";
import { readTopicLedger, setProposedPlan, slugify, writeTopicLedger } from "../../scripts/mastery.mjs";

// The plan question blocks until the learner answers, and the ledger only learns the
// plan on approval (mastery-record.mjs). Store the valid plan as proposed before the
// question is shown, so `/map` can draw it while the learner decides.
export function handlePayload(payload) {
  if (payload?.hook_event_name !== "PreToolUse" || payload?.tool_name !== "AskUserQuestion") return;
  const event = parseTeachEvent(payload.tool_input?.metadata?.source);
  if (event?.kind !== "plan") return;
  if (validateTeachEvent(event, payload.tool_input?.questions).length > 0) return;
  const topic = slugify(event.topic);
  writeTopicLedger(topic, setProposedPlan(readTopicLedger(topic), event.plan));
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
