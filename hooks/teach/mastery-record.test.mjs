import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync as readFileSyncNode } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseTeachEvent, gradeAnswer, applyTeachEvent, APPROVAL_LABEL } from "./mastery-record.mjs";
import { emptyLedger, getSession, getTopic, touchSession, setSessionPlan } from "../../scripts/mastery.mjs";

const SCRIPT = fileURLToPath(new URL("./mastery-record.mjs", import.meta.url));

function freshConfigDir() {
  return mkdtempSync(join(tmpdir(), "mastery-record-test-"));
}

test("parseTeachEvent returns null for undefined source", () => {
  assert.equal(parseTeachEvent(undefined), null);
});

test("parseTeachEvent returns null for non-JSON source (e.g. another feature's plain string, like /remember's 'source' usage)", () => {
  assert.equal(parseTeachEvent("remember"), null);
});

test("parseTeachEvent returns null for valid JSON that isn't namespaced to sensei-teach", () => {
  assert.equal(parseTeachEvent(JSON.stringify({ app: "something-else", topic: "javascript" })), null);
});

test("parseTeachEvent returns the parsed object for a correctly namespaced event", () => {
  const event = { app: "sensei-teach", v: 1, kind: "node", topic: "javascript", node: "dynamic-typing", recordAs: "seen" };
  assert.deepEqual(parseTeachEvent(JSON.stringify(event)), event);
});

test("gradeAnswer returns passed when the answer literally matches correct", () => {
  const event = { kind: "node", recordAs: "graded", correct: "Option A" };
  assert.equal(gradeAnswer(event, "Option A", ["Option A", "Option B", "I don't know"]), "passed");
});

test("gradeAnswer returns failed when the answer is a real option but not the correct one", () => {
  const event = { kind: "node", recordAs: "graded", correct: "Option A" };
  assert.equal(gradeAnswer(event, "Option B", ["Option A", "Option B", "I don't know"]), "failed");
});

test("gradeAnswer returns failed when the answer is 'I don't know'", () => {
  const event = { kind: "node", recordAs: "graded", correct: "Option A" };
  assert.equal(gradeAnswer(event, "I don't know", ["Option A", "Option B", "I don't know"]), "failed");
});

test("gradeAnswer returns invalid when correct doesn't match any real option label (authoring bug)", () => {
  const event = { kind: "node", recordAs: "graded", correct: "Option Z" };
  assert.equal(gradeAnswer(event, "Option A", ["Option A", "Option B", "I don't know"]), "invalid");
});

test("applyTeachEvent records a 'seen' node and touches the session row", () => {
  const event = { app: "sensei-teach", v: 1, kind: "node", topic: "javascript", node: "dynamic-typing", recordAs: "seen" };
  const { ledger, diagnostic } = applyTeachEvent(emptyLedger(), event, "n/a", [], new Date("2026-01-01T00:00:00.000Z"));
  assert.equal(diagnostic, undefined);
  assert.equal(getTopic(ledger, "javascript")["dynamic-typing"].status, "seen");
  assert.ok(getSession(ledger, "javascript"), "session row must exist after any teach-tagged question");
});

test("applyTeachEvent grades a correct answer as passed and advances the session", () => {
  const plan = { nodes: ["dynamic-typing", "closures"], edges: [] };
  let ledger = setSessionPlan(emptyLedger(), "javascript", plan, new Date("2026-01-01T00:00:00.000Z"));
  const event = { app: "sensei-teach", v: 1, kind: "node", topic: "javascript", node: "dynamic-typing", recordAs: "graded", correct: "Option A" };
  const result = applyTeachEvent(ledger, event, "Option A", ["Option A", "Option B", "I don't know"], new Date("2026-01-02T00:00:00.000Z"));
  assert.equal(getTopic(result.ledger, "javascript")["dynamic-typing"].status, "passed");
  assert.equal(getSession(result.ledger, "javascript").nextNodeId, "closures");
});

test("applyTeachEvent grades a wrong answer as failed without advancing the session", () => {
  const plan = { nodes: ["dynamic-typing", "closures"], edges: [] };
  let ledger = setSessionPlan(emptyLedger(), "javascript", plan, new Date("2026-01-01T00:00:00.000Z"));
  const event = { app: "sensei-teach", v: 1, kind: "node", topic: "javascript", node: "dynamic-typing", recordAs: "graded", correct: "Option A" };
  const result = applyTeachEvent(ledger, event, "Option B", ["Option A", "Option B", "I don't know"], new Date("2026-01-02T00:00:00.000Z"));
  assert.equal(getTopic(result.ledger, "javascript")["dynamic-typing"].status, "failed");
  assert.equal(getSession(result.ledger, "javascript").nextNodeId, "dynamic-typing");
});

test("applyTeachEvent returns a diagnostic and does not write a bogus failed when correct doesn't match any option", () => {
  const event = { app: "sensei-teach", v: 1, kind: "node", topic: "javascript", node: "dynamic-typing", recordAs: "graded", correct: "Option Z" };
  const before = touchSession(emptyLedger(), "javascript", new Date("2026-01-01T00:00:00.000Z"));
  const result = applyTeachEvent(before, event, "Option A", ["Option A", "Option B"], new Date("2026-01-02T00:00:00.000Z"));
  assert.match(result.diagnostic, /does not match any option/);
  assert.equal(getTopic(result.ledger, "javascript")["dynamic-typing"], undefined, "no bogus failed/passed status must be written");
});

test("applyTeachEvent logs a Phase 1a probe and creates the session row, with no node ID required", () => {
  const event = { app: "sensei-teach", v: 1, kind: "probe", topic: "powershell-scripting" };
  const { ledger, diagnostic } = applyTeachEvent(emptyLedger(), event, "Not sure", ["A", "B", "I don't know"], new Date("2026-01-01T00:00:00.000Z"), "What's a cmdlet?");
  assert.equal(diagnostic, undefined);
  const session = getSession(ledger, "powershell-scripting");
  assert.equal(session.status, "intake");
  assert.deepEqual(session.probes, [{ question: "What's a cmdlet?", answer: "Not sure", at: "2026-01-01T00:00:00.000Z" }]);
});

test("applyTeachEvent slugifies event.topic before touching the ledger, matching the CLI's get/get-session contract", () => {
  const event = { app: "sensei-teach", v: 1, kind: "goal", topic: "PowerShell Scripting", goal: "learn scripting" };
  const { ledger } = applyTeachEvent(emptyLedger(), event, "n/a", [], new Date("2026-01-01T00:00:00.000Z"));
  assert.ok(getSession(ledger, "powershell-scripting"), "session must be keyed by the slugified topic");
  assert.equal(getSession(ledger, "PowerShell Scripting"), null, "an unslugified lookup must not accidentally match");
});

test("applyTeachEvent sets the goal for a 'goal' event", () => {
  const event = { app: "sensei-teach", v: 1, kind: "goal", topic: "javascript", goal: "understand fundamentals" };
  const { ledger } = applyTeachEvent(emptyLedger(), event, "n/a", [], new Date("2026-01-01T00:00:00.000Z"));
  assert.equal(getSession(ledger, "javascript").goal, "understand fundamentals");
});

test("applyTeachEvent sets the plan for a 'plan' event only when the answer matches the canonical approval label", () => {
  const plan = { nodes: ["primitives"], edges: [] };
  const event = { app: "sensei-teach", v: 1, kind: "plan", topic: "javascript", plan };
  const approved = applyTeachEvent(emptyLedger(), event, APPROVAL_LABEL, [APPROVAL_LABEL, "I have changes"], new Date("2026-01-01T00:00:00.000Z"));
  assert.equal(approved.ledger.sessions.javascript.status, "planned");

  const declined = applyTeachEvent(emptyLedger(), event, "I have changes", [APPROVAL_LABEL, "I have changes"], new Date("2026-01-01T00:00:00.000Z"));
  assert.equal(declined.ledger.sessions.javascript.status, "intake", "declining approval must not set the plan");
});

test("main() survives unparseable JSON on stdin without crashing", () => {
  assert.doesNotThrow(() => execFileSync(process.execPath, [SCRIPT], { input: "not json" }));
});

test("main() survives a PostToolUse payload for a different tool without crashing or writing", () => {
  const configDir = freshConfigDir();
  const env = { ...process.env, CLAUDE_CONFIG_DIR: configDir };
  assert.doesNotThrow(() =>
    execFileSync(process.execPath, [SCRIPT], {
      input: JSON.stringify({ hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: {}, tool_response: {} }),
      env,
    }),
  );
});

test("main() survives an AskUserQuestion payload with no teach metadata without writing a ledger", () => {
  const configDir = freshConfigDir();
  const env = { ...process.env, CLAUDE_CONFIG_DIR: configDir };
  execFileSync(process.execPath, [SCRIPT], {
    input: JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: "AskUserQuestion",
      tool_input: { questions: [{ question: "Pick one", options: [{ label: "A" }] }], metadata: {} },
      tool_response: { answers: { "Pick one": "A" } },
    }),
    env,
  });
  assert.equal(existsSync(join(configDir, "sensei", "mastery.json")), false);
});

test("main() writes a real 'seen' record end-to-end for a correctly teach-tagged AskUserQuestion payload", () => {
  const configDir = freshConfigDir();
  const env = { ...process.env, CLAUDE_CONFIG_DIR: configDir };
  const source = JSON.stringify({ app: "sensei-teach", v: 1, kind: "node", topic: "javascript", node: "dynamic-typing", recordAs: "seen" });
  execFileSync(process.execPath, [SCRIPT], {
    input: JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: "AskUserQuestion",
      tool_input: { questions: [{ question: "What type is undefined?", options: [{ label: "A" }] }], metadata: { source } },
      tool_response: { answers: { "What type is undefined?": "A" } },
    }),
    env,
  });
  const ledger = JSON.parse(readFileSyncNode(join(configDir, "sensei", "mastery.json"), "utf8"));
  assert.equal(ledger.topics.javascript["dynamic-typing"].status, "seen");
});
