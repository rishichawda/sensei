import { parseTeachEvent, expandEvents, gradeAnswer } from "../teach/mastery-record.mjs";
import { readTopicLedger, slugify } from "../../scripts/mastery.mjs";
import { recordCheck, writeMap } from "./writer.mjs";
import { writeActive, clearActive, isSessionId, logVaultError } from "./state.mjs";
import { isSlug } from "./paths.mjs";
import { labelOf, prerequisitesOf } from "./graph.mjs";

// Runs beside mastery-record.mjs on every AskUserQuestion result. It reuses that
// file's parsing and grading so the vault can never disagree with the ledger, and
// it is a separate hook so a vault failure cannot touch grading.
export function handlePayload(payload, env = process.env, now = new Date()) {
  if (payload?.hook_event_name !== "PostToolUse" || payload?.tool_name !== "AskUserQuestion") return;
  const event = parseTeachEvent(payload.tool_input?.metadata?.source);
  if (!event) return;

  const sessionId = payload.session_id;
  const questions = Array.isArray(payload.tool_input?.questions) ? payload.tool_input.questions : [];
  const answers = payload.tool_response?.answers;
  const firstAnswer = questions[0] ? answers?.[questions[0].question] : undefined;

  if (event.kind === "wrap") {
    if (typeof event.done === "string" && firstAnswer === event.done && isSessionId(sessionId)) clearActive(sessionId, env);
    return;
  }
  if (!event.topic) return;

  const topic = slugify(event.topic);
  if (isSessionId(sessionId)) writeActive(sessionId, topic, env);

  if (event.kind === "plan") {
    if (questions[0] && firstAnswer === event.approve) {
      const goal = readTopicLedger(topic, { quarantine: false }).session?.goal ?? null;
      writeMap({ env, topic, goal, plan: event.plan });
    }
    return;
  }

  if (event.kind !== "node" || !isSessionId(sessionId)) return;

  const plan = readTopicLedger(topic, { quarantine: false }).session?.dependencyMap ?? null;
  for (const { event: ev, question } of expandEvents(event, questions)) {
    if (ev.recordAs !== "graded") continue; // recordAs sits on each item in a batched tag
    const picked = answers?.[question.question];
    if (typeof picked !== "string") continue;
    const labels = Array.isArray(question.options) ? question.options.map((o) => o?.label) : [];
    const result = gradeAnswer(ev, picked, labels);
    if (result === "invalid") continue;
    if (!isSlug(ev.node)) {
      logVaultError(`invalid node ${JSON.stringify(ev.node)} in a graded check; nothing written`, env);
      continue;
    }
    // The model may write a free-recall card for a vault note; without one the card is the quiz as asked.
    const card = ev.card
      ? { question: ev.card.q, answer: ev.card.a, options: [] }
      : { question: question.question, answer: ev.correct, options: labels.filter((l) => typeof l === "string") };
    recordCheck({ env, topic, node: ev.node, label: labelOf(plan, ev.node), sessionId, now, requires: prerequisitesOf(plan, ev.node).map((p) => labelOf(plan, p)), picked, result, ...card });
  }
}

async function main() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  try {
    handlePayload(JSON.parse(raw));
  } catch (error) {
    logVaultError(`record-check failed: ${error.message}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
