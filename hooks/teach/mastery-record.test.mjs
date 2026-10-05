import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync as readFileSyncNode } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseTeachEvent, gradeAnswer, applyTeachEvent, truncate } from "./mastery-record.mjs";
import { emptyTopicLedger, getSession, getTopic, touchSession, setSessionPlan, topicLedgerPath, ledgersDir } from "../../scripts/mastery.mjs";

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

test("truncate returns a short string unchanged", () => {
  assert.equal(truncate("short"), "short");
});

test("truncate cuts a long string and marks it with an ellipsis", () => {
  const long = "x".repeat(200);
  const result = truncate(long, 150);
  assert.equal(result.length, 151);
  assert.ok(result.endsWith("…"));
});

test("truncate returns undefined for non-string input", () => {
  assert.equal(truncate(undefined), undefined);
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
  const { ledger, diagnostic } = applyTeachEvent(emptyTopicLedger(), event, "n/a", [], new Date("2026-01-01T00:00:00.000Z"));
  assert.equal(diagnostic, undefined);
  assert.equal(getTopic(ledger)["dynamic-typing"].status, "seen");
  assert.ok(getSession(ledger), "session row must exist after any teach-tagged question");
});

test("applyTeachEvent grades a correct answer as passed and advances the session", () => {
  const plan = { nodes: ["dynamic-typing", "closures"], edges: [] };
  let topicLedger = setSessionPlan(emptyTopicLedger(), plan, new Date("2026-01-01T00:00:00.000Z"));
  const event = { app: "sensei-teach", v: 1, kind: "node", topic: "javascript", node: "dynamic-typing", recordAs: "graded", correct: "Option A" };
  const result = applyTeachEvent(topicLedger, event, "Option A", ["Option A", "Option B", "I don't know"], new Date("2026-01-02T00:00:00.000Z"));
  assert.equal(getTopic(result.ledger)["dynamic-typing"].status, "passed");
  assert.equal(getSession(result.ledger).nextNodeId, "closures");
});

test("applyTeachEvent grades a wrong answer as failed without advancing the session", () => {
  const plan = { nodes: ["dynamic-typing", "closures"], edges: [] };
  let topicLedger = setSessionPlan(emptyTopicLedger(), plan, new Date("2026-01-01T00:00:00.000Z"));
  const event = { app: "sensei-teach", v: 1, kind: "node", topic: "javascript", node: "dynamic-typing", recordAs: "graded", correct: "Option A" };
  const result = applyTeachEvent(topicLedger, event, "Option B", ["Option A", "Option B", "I don't know"], new Date("2026-01-02T00:00:00.000Z"));
  assert.equal(getTopic(result.ledger)["dynamic-typing"].status, "failed");
  assert.equal(getSession(result.ledger).nextNodeId, "dynamic-typing");
});

test("applyTeachEvent returns a diagnostic and does not write a bogus failed when correct doesn't match any option", () => {
  const event = { app: "sensei-teach", v: 1, kind: "node", topic: "javascript", node: "dynamic-typing", recordAs: "graded", correct: "Option Z" };
  const before = touchSession(emptyTopicLedger(), new Date("2026-01-01T00:00:00.000Z"));
  const result = applyTeachEvent(before, event, "Option A", ["Option A", "Option B"], new Date("2026-01-02T00:00:00.000Z"));
  assert.match(result.diagnostic, /does not match any option/);
  assert.equal(getTopic(result.ledger)["dynamic-typing"], undefined, "no bogus failed/passed status must be written");
});

test("applyTeachEvent logs a Phase 1a probe and creates the session row, with no node ID required", () => {
  const event = { app: "sensei-teach", v: 1, kind: "probe", topic: "powershell-scripting" };
  const { ledger, diagnostic } = applyTeachEvent(emptyTopicLedger(), event, "Not sure", ["A", "B", "I don't know"], new Date("2026-01-01T00:00:00.000Z"), "What's a cmdlet?");
  assert.equal(diagnostic, undefined);
  const session = getSession(ledger);
  assert.equal(session.status, "intake");
  assert.deepEqual(session.probes, [{ question: "What's a cmdlet?", answer: "Not sure", at: "2026-01-01T00:00:00.000Z" }]);
});

test("applyTeachEvent sets the goal for a 'goal' event", () => {
  const event = { app: "sensei-teach", v: 1, kind: "goal", topic: "javascript", goal: "understand fundamentals" };
  const { ledger } = applyTeachEvent(emptyTopicLedger(), event, "n/a", [], new Date("2026-01-01T00:00:00.000Z"));
  assert.equal(getSession(ledger).goal, "understand fundamentals");
});

test("applyTeachEvent sets the plan for a 'plan' event when the answer matches the single offered option, for any wording", () => {
  const plan = { nodes: ["primitives"], edges: [] };
  const event = { app: "sensei-teach", v: 1, kind: "plan", topic: "javascript", plan };
  const approved = applyTeachEvent(emptyTopicLedger(), event, "Sounds great, let's begin", ["Sounds great, let's begin"], new Date("2026-01-01T00:00:00.000Z"));
  assert.equal(approved.ledger.session.status, "planned");

  const approvedDifferentWording = applyTeachEvent(emptyTopicLedger(), event, "Yep, go ahead", ["Yep, go ahead"], new Date("2026-01-01T00:00:00.000Z"));
  assert.equal(approvedDifferentWording.ledger.session.status, "planned", "approval must not depend on any specific wording");
});

test("applyTeachEvent does not set the plan when the answer came from 'Other' (decline/feedback), regardless of the offered option's wording", () => {
  const plan = { nodes: ["primitives"], edges: [] };
  const event = { app: "sensei-teach", v: 1, kind: "plan", topic: "javascript", plan };
  const declined = applyTeachEvent(emptyTopicLedger(), event, "Actually let's change the order first", ["Sounds great, let's begin"], new Date("2026-01-01T00:00:00.000Z"));
  assert.equal(declined.ledger.session.status, "intake", "an 'Other' answer must not match the single offered option");
});

test("applyTeachEvent returns a diagnostic and does not set the plan when a 'plan' event carries more than one real option", () => {
  const plan = { nodes: ["primitives"], edges: [] };
  const event = { app: "sensei-teach", v: 1, kind: "plan", topic: "javascript", plan };
  const result = applyTeachEvent(emptyTopicLedger(), event, "Looks good", ["Looks good", "Not yet"], new Date("2026-01-01T00:00:00.000Z"));
  assert.match(result.diagnostic, /exactly one option/);
  assert.equal(result.ledger.session.status, "intake", "a malformed approval call must leave the session unplanned");
});

test("applyTeachEvent returns a diagnostic and does not set the plan when a 'plan' event carries zero real options", () => {
  const plan = { nodes: ["primitives"], edges: [] };
  const event = { app: "sensei-teach", v: 1, kind: "plan", topic: "javascript", plan };
  const result = applyTeachEvent(emptyTopicLedger(), event, "n/a", [], new Date("2026-01-01T00:00:00.000Z"));
  assert.match(result.diagnostic, /exactly one option/);
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

test("main() survives an AskUserQuestion payload with no teach metadata without writing a ledger file", () => {
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
  withEnv(env, () => assert.equal(existsSync(topicLedgerPath("pick-one")), false));
});

test("main() writes a real 'seen' record end-to-end for a correctly teach-tagged AskUserQuestion payload, into that topic's own file", () => {
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
  let ledger;
  withEnv(env, () => {
    ledger = JSON.parse(readFileSyncNode(topicLedgerPath("javascript"), "utf8"));
  });
  assert.equal(ledger.nodes["dynamic-typing"].status, "seen");
});

test("main() writes each topic to its own file, never touching a sibling topic's file", () => {
  const configDir = freshConfigDir();
  const env = { ...process.env, CLAUDE_CONFIG_DIR: configDir };
  const jsSource = JSON.stringify({ app: "sensei-teach", v: 1, kind: "node", topic: "javascript", node: "closures", recordAs: "seen" });
  execFileSync(process.execPath, [SCRIPT], {
    input: JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: "AskUserQuestion",
      tool_input: { questions: [{ question: "Q1", options: [{ label: "A" }] }], metadata: { source: jsSource } },
      tool_response: { answers: { Q1: "A" } },
    }),
    env,
  });
  const rustSource = JSON.stringify({ app: "sensei-teach", v: 1, kind: "node", topic: "rust", node: "ownership", recordAs: "seen" });
  execFileSync(process.execPath, [SCRIPT], {
    input: JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: "AskUserQuestion",
      tool_input: { questions: [{ question: "Q2", options: [{ label: "A" }] }], metadata: { source: rustSource } },
      tool_response: { answers: { Q2: "A" } },
    }),
    env,
  });
  withEnv(env, () => {
    const js = JSON.parse(readFileSyncNode(topicLedgerPath("javascript"), "utf8"));
    const rust = JSON.parse(readFileSyncNode(topicLedgerPath("rust"), "utf8"));
    assert.deepEqual(Object.keys(js.nodes), ["closures"]);
    assert.deepEqual(Object.keys(rust.nodes), ["ownership"]);
  });
});

test("main() logs the question text for an untagged call, so a 'tagged:false' line is actually diagnostic", () => {
  const configDir = freshConfigDir();
  const env = { ...process.env, CLAUDE_CONFIG_DIR: configDir };
  execFileSync(process.execPath, [SCRIPT], {
    input: JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: "AskUserQuestion",
      tool_input: { questions: [{ question: "What does $? mean?", options: [{ label: "A" }] }], metadata: {} },
      tool_response: { answers: { "What does $? mean?": "A" } },
    }),
    env,
  });
  const lines = readFileSyncNode(join(configDir, "sensei", "mastery-hook-debug.log"), "utf8").trim().split("\n");
  const entry = JSON.parse(lines[lines.length - 1]);
  assert.equal(entry.tagged, false);
  assert.equal(entry.question, "What does $? mean?");
});

test("main() logs the raw (truncated) metadata.source when present but not teach-tagged, so a near-miss is visible", () => {
  const configDir = freshConfigDir();
  const env = { ...process.env, CLAUDE_CONFIG_DIR: configDir };
  execFileSync(process.execPath, [SCRIPT], {
    input: JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: "AskUserQuestion",
      tool_input: { questions: [{ question: "Pick one", options: [{ label: "A" }] }], metadata: { source: "remember" } },
      tool_response: { answers: { "Pick one": "A" } },
    }),
    env,
  });
  const lines = readFileSyncNode(join(configDir, "sensei", "mastery-hook-debug.log"), "utf8").trim().split("\n");
  const entry = JSON.parse(lines[lines.length - 1]);
  assert.equal(entry.tagged, false);
  assert.equal(entry.sourceRaw, "remember");
});

test("main() logs tagged:true and writes no ledger file for a 'kind: other' event with no topic", () => {
  const configDir = freshConfigDir();
  const env = { ...process.env, CLAUDE_CONFIG_DIR: configDir };
  const source = JSON.stringify({ app: "sensei-teach", v: 1, kind: "other" });
  execFileSync(process.execPath, [SCRIPT], {
    input: JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: "AskUserQuestion",
      tool_input: { questions: [{ question: "Which topic did you mean?", options: [{ label: "networking" }, { label: "home-networking" }] }], metadata: { source } },
      tool_response: { answers: { "Which topic did you mean?": "networking" } },
    }),
    env,
  });
  const lines = readFileSyncNode(join(configDir, "sensei", "mastery-hook-debug.log"), "utf8").trim().split("\n");
  const entry = JSON.parse(lines[lines.length - 1]);
  assert.equal(entry.tagged, true);
  withEnv(env, () => assert.equal(existsSync(ledgersDir()), false, "no ledgers directory must be created at all for a topicless event — nothing was ever read or written"));
});

test("main() touches that topic's session for a 'kind: other' event that does include a topic", () => {
  const configDir = freshConfigDir();
  const env = { ...process.env, CLAUDE_CONFIG_DIR: configDir };
  const source = JSON.stringify({ app: "sensei-teach", v: 1, kind: "other", topic: "javascript" });
  execFileSync(process.execPath, [SCRIPT], {
    input: JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: "AskUserQuestion",
      tool_input: { questions: [{ question: "Sub-area?", options: [{ label: "closures" }] }], metadata: { source } },
      tool_response: { answers: { "Sub-area?": "closures" } },
    }),
    env,
  });
  withEnv(env, () => {
    const ledger = JSON.parse(readFileSyncNode(topicLedgerPath("javascript"), "utf8"));
    assert.ok(ledger.session, "a 'kind: other' event with a topic must still touch that topic's session row");
  });
});

function withEnv(env, fn) {
  const original = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = env.CLAUDE_CONFIG_DIR;
  try {
    return fn();
  } finally {
    if (original === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = original;
  }
}
