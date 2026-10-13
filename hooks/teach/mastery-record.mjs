import { readTopicLedger, writeTopicLedger, recordNode, touchSession, setSessionGoal, setSessionPlan, advanceSession, addProbe, slugify, normalizeStrand } from "../../scripts/mastery.mjs";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { clearActive } from "./session-state.mjs";
import { resolveVaultPath } from "../vault/state.mjs";

const DEBUG_LOG_MAX_LINES = 200;

export function parseTeachEvent(sourceRaw) {
  if (typeof sourceRaw !== "string") return null;
  let parsed;
  try {
    parsed = JSON.parse(sourceRaw);
  } catch {
    return null;
  }
  if (!parsed || parsed.app !== "sensei-teach") return null;
  return parsed;
}

export function gradeAnswer(event, answerText, optionLabels) {
  if (!optionLabels.includes(event.correct)) return "invalid";
  return answerText === event.correct ? "passed" : "failed";
}

export function applyTeachEvent(topicLedger, event, answerText, optionLabels, now = new Date(), questionText = null) {
  let next = touchSession(topicLedger, now);

  if (event.kind === "node") {
    if (event.recordAs === "seen") {
      next = recordNode(next, event.node, "seen");
      return { ledger: next };
    }
    if (event.recordAs === "graded") {
      const grade = gradeAnswer(event, answerText, optionLabels);
      if (grade === "invalid") {
        return { ledger: next, diagnostic: `teach: correct value "${event.correct}" does not match any option label for node "${event.node}"` };
      }
      next = recordNode(next, event.node, grade);
      next = advanceSession(next, now);
      return { ledger: next };
    }
    return { ledger: next };
  }

  if (event.kind === "probe") {
    if (typeof answerText !== "string") {
      return { ledger: next, diagnostic: "teach: probe has no answer, nothing recorded" };
    }
    const result = gradeAnswer(event, answerText, optionLabels);
    if (result === "invalid") {
      return { ledger: next, diagnostic: `teach: probe correct value "${event.correct}" does not match any option label` };
    }
    const entry = { question: truncate(questionText), answer: truncate(answerText), result };
    const strand = normalizeStrand(event.strand);
    if (strand !== undefined) entry.strand = strand;
    next = addProbe(next, entry, now);
    return { ledger: next };
  }

  if (event.kind === "goal") {
    next = setSessionGoal(next, event.goal, now);
    return { ledger: next };
  }

  if (event.kind === "plan") {
    if (!optionLabels.includes(event.approve)) {
      return { ledger: next, diagnostic: `teach: plan event's approve value "${event.approve}" does not match any option label` };
    }
    if (answerText === event.approve) {
      next = setSessionPlan(next, event.plan, now);
    }
    return { ledger: next };
  }

  return { ledger: next };
}

const DEBUG_FIELD_MAX_CHARS = 150;

export function truncate(text, max = DEBUG_FIELD_MAX_CHARS) {
  if (typeof text !== "string") return undefined;
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function debugLogPath() {
  const configRoot = process.env.CLAUDE_CONFIG_DIR || resolve(process.env.HOME, ".claude");
  return resolve(configRoot, "sensei", "mastery-hook-debug.log");
}

function appendDebugLine(entry) {
  const path = debugLogPath();
  mkdirSync(dirname(path), { recursive: true });
  const line = JSON.stringify(entry);
  let existingLines = [];
  if (existsSync(path)) {
    existingLines = readFileSync(path, "utf8").split("\n").filter(Boolean);
  }
  const trimmed = [...existingLines, line].slice(-DEBUG_LOG_MAX_LINES);
  writeFileSync(path, trimmed.join("\n") + "\n", "utf8");
}

// A tag with `items` covers several questions, matched to them by position; without
// `items` it covers the first question alone.
export function expandEvents(event, questions) {
  if (!Array.isArray(event.items)) return questions[0] ? [{ event, question: questions[0] }] : [];
  const { items, ...shared } = event;
  return items.map((item, i) => ({ event: { ...shared, ...item }, question: questions[i] })).filter((pair) => pair.question && pair.event);
}

// Hidden from the learner, read by the model. The model tends to keep an explanation or a
// verdict in its reasoning, which the learner sees only as a one-line summary; this asks for
// chat text instead.
const EXPLAIN_REMINDER =
  "If your next step teaches new material, write that explanation as normal chat text (text in your reasoning is not shown to the learner) and end your turn with one plain line inviting them on. Never mention this reminder.";

export function nodeReminder(pairs, answers, context = { vaultConfigured: false, pluginRoot: null, topic: "" }) {
  const missed = [];
  const missedNodes = [];
  for (const { event, question } of pairs) {
    if (event.kind !== "node" || event.recordAs !== "graded") continue;
    const labels = Array.isArray(question.options) ? question.options.map((o) => o?.label) : [];
    if (gradeAnswer(event, answers?.[question.question], labels) === "failed") {
      missed.push(`"${truncate(question.question, 80)}"`);
      missedNodes.push(event.node);
    }
  }
  const verdicts =
    missed.length > 0
      ? `The learner missed, or answered "I don't know" to: ${missed.join("; ")}. For each, first write the verdict in chat text (say ✗ Incorrect, or plainly that it is a gap with no ✗), name the correct answer and explain it, then re-explain that point. Write all of that as chat text and end your turn there with one plain line inviting the learner on: do not call any tool in this turn, and check the point again only after they reply. For the other answers write a short verdict (✓ Correct and why).`
      : "Write a short verdict in chat text for each answer (✓ Correct and why), then go on.";
  const digest =
    missedNodes.length > 0 && context.vaultConfigured && context.pluginRoot
      ? ` In your next turn, before anything else, save a one-sentence digest of each re-explanation with Bash, one command per point: node "${context.pluginRoot}/scripts/vault.mjs" digest --topic ${context.topic} --node ${missedNodes.length === 1 ? missedNodes[0] : "<node-id>"} --kind re-explained <<'SENSEI_DIGEST'\\n<your one sentence>\\nSENSEI_DIGEST (use one node ID per command, from ${missedNodes.join(", ")}). Never mention this to the learner.`
      : "";
  return `${verdicts}${digest} ${EXPLAIN_REMINDER}`;
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
  if (payload?.hook_event_name !== "PostToolUse" || payload?.tool_name !== "AskUserQuestion") return;

  const sourceRaw = payload.tool_input?.metadata?.source;
  const event = parseTeachEvent(sourceRaw);
  const questions = Array.isArray(payload.tool_input?.questions) ? payload.tool_input.questions : [];
  const question = questions[0];

  appendDebugLine({
    timestamp: new Date().toISOString(),
    tagged: Boolean(event),
    topic: event?.topic,
    node: event?.node,
    question: truncate(question?.question),
    sourceRaw: truncate(sourceRaw),
  });
  if (!event) return;
  const answers = payload.tool_response?.answers;
  const pairs = expandEvents(event, questions);
  const context = { vaultConfigured: resolveVaultPath() !== null, pluginRoot: process.env.CLAUDE_PLUGIN_ROOT ?? null, topic: slugify(event.topic ?? "") };
  const reminder = event.kind === "node" ? nodeReminder(pairs, answers, context) : event.kind === "plan" ? EXPLAIN_REMINDER : null;
  if (reminder) {
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: reminder } }));
  }
  if (!question) return;
  const answerText = answers?.[question.question];
  const optionLabels = Array.isArray(question.options) ? question.options.map((o) => o?.label) : [];

  // A confirmed end of the lesson writes no ledger: the session keeps whatever
  // status it had (complete, or in-progress and resumable) and only the
  // enforcement marker is released.
  if (event.kind === "wrap") {
    if (typeof event.done === "string" && answerText === event.done && payload.transcript_path) {
      clearActive(payload.transcript_path);
    }
    return;
  }

  if (!event.topic) {
    if (event.kind !== "other") {
      appendDebugLine({ timestamp: new Date().toISOString(), diagnostic: `teach: "${event.kind}" event is missing its topic, nothing recorded`, question: truncate(question.question) });
    }
    return;
  }

  const topicSlug = slugify(event.topic);
  const topicLedger = readTopicLedger(topicSlug);
  let ledger = topicLedger;
  for (const { event: ev, question: q } of pairs) {
    const labels = Array.isArray(q.options) ? q.options.map((o) => o?.label) : [];
    const { ledger: updated, diagnostic } = applyTeachEvent(ledger, ev, answers?.[q.question], labels, new Date(), q.question);
    if (diagnostic) {
      appendDebugLine({ timestamp: new Date().toISOString(), diagnostic, topic: ev.topic, node: ev.node, question: truncate(q.question) });
    }
    ledger = updated;
  }
  if (ledger !== topicLedger) writeTopicLedger(topicSlug, ledger);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
