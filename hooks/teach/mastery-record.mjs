import { readLedger, writeLedger, recordNode, touchSession, setSessionGoal, setSessionPlan, advanceSession, addProbe, slugify } from "../../scripts/mastery.mjs";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export const APPROVAL_LABEL = "Looks good — let's start";
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

export function applyTeachEvent(ledger, event, answerText, optionLabels, now = new Date(), questionText = null) {
  const topic = slugify(event.topic);
  let next = touchSession(ledger, topic, now);

  if (event.kind === "node") {
    if (event.recordAs === "seen") {
      next = recordNode(next, topic, event.node, "seen");
      return { ledger: next };
    }
    if (event.recordAs === "graded") {
      const grade = gradeAnswer(event, answerText, optionLabels);
      if (grade === "invalid") {
        return { ledger: next, diagnostic: `teach: correct value "${event.correct}" does not match any option label for node "${event.node}"` };
      }
      next = recordNode(next, topic, event.node, grade);
      next = advanceSession(next, topic, event.node, grade, now);
      return { ledger: next };
    }
    return { ledger: next };
  }

  if (event.kind === "probe") {
    next = addProbe(next, topic, { question: questionText, answer: answerText }, now);
    return { ledger: next };
  }

  if (event.kind === "goal") {
    next = setSessionGoal(next, topic, event.goal, now);
    return { ledger: next };
  }

  if (event.kind === "plan") {
    if (answerText === APPROVAL_LABEL) {
      next = setSessionPlan(next, topic, event.plan, now);
    }
    return { ledger: next };
  }

  return { ledger: next };
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
  appendDebugLine({ timestamp: new Date().toISOString(), tagged: Boolean(event), topic: event?.topic, node: event?.node });
  if (!event) return;

  const questions = Array.isArray(payload.tool_input?.questions) ? payload.tool_input.questions : [];
  const question = questions[0];
  if (!question) return;
  const answerText = payload.tool_response?.answers?.[question.question];
  const optionLabels = Array.isArray(question.options) ? question.options.map((o) => o.label) : [];

  const ledger = readLedger();
  const { ledger: updated, diagnostic } = applyTeachEvent(ledger, event, answerText, optionLabels, new Date(), question.question);
  if (diagnostic) appendDebugLine({ timestamp: new Date().toISOString(), diagnostic, topic: event.topic, node: event.node });
  if (updated !== ledger) writeLedger(updated);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
