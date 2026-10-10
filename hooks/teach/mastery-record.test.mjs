import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync as readFileSyncNode } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseTeachEvent, gradeAnswer, applyTeachEvent, truncate } from "./mastery-record.mjs";
import { emptyTopicLedger, getSession, getTopic, touchSession, setSessionPlan, topicLedgerPath, ledgersDir, writeTopicLedger, recordNode, advanceSession } from "../../scripts/mastery.mjs";
import { markActive, isActive } from "./session-state.mjs";

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

const PROBE_OPTIONS = ["A", "B", "I don't know"];
const probeEvent = (extra = {}) => ({ app: "sensei-teach", v: 1, kind: "probe", topic: "powershell-scripting", correct: "A", ...extra });
const PROBE_NOW = new Date("2026-01-01T00:00:00.000Z");

test("applyTeachEvent logs a Phase 1b probe with a passed result and creates the session row, with no node ID required", () => {
  const { ledger, diagnostic } = applyTeachEvent(emptyTopicLedger(), probeEvent(), "A", PROBE_OPTIONS, PROBE_NOW, "What's a cmdlet?");
  assert.equal(diagnostic, undefined);
  const session = getSession(ledger);
  assert.equal(session.status, "intake");
  assert.deepEqual(session.probes, [{ question: "What's a cmdlet?", answer: "A", result: "passed", at: "2026-01-01T00:00:00.000Z" }]);
});

test("applyTeachEvent stores failed for a wrong option, for I don't know, and for free-text Other", () => {
  for (const answer of ["B", "I don't know", "something I typed myself"]) {
    const { ledger } = applyTeachEvent(emptyTopicLedger(), probeEvent(), answer, PROBE_OPTIONS, PROBE_NOW, "Q?");
    assert.equal(getSession(ledger).probes[0].result, "failed", answer);
  }
});

test("applyTeachEvent stores the normalized strand on a probe", () => {
  const { ledger } = applyTeachEvent(emptyTopicLedger(), probeEvent({ strand: "  Heat  Time " }), "A", PROBE_OPTIONS, PROBE_NOW, "Q?");
  assert.deepEqual(getSession(ledger).probes, [{ question: "Q?", answer: "A", result: "passed", strand: "heat time", at: "2026-01-01T00:00:00.000Z" }]);
});

test("applyTeachEvent cuts a long strand to 60 characters", () => {
  const { ledger } = applyTeachEvent(emptyTopicLedger(), probeEvent({ strand: "s".repeat(100) }), "A", PROBE_OPTIONS, PROBE_NOW, "Q?");
  assert.equal(getSession(ledger).probes[0].strand, "s".repeat(60));
});

test("applyTeachEvent stores no strand key for a probe sent without one, or with an unusable one, and still stores the result", () => {
  for (const extra of [{}, { strand: "" }, { strand: "   " }, { strand: "\u200b" }, { strand: 5 }, { strand: null }, { strand: ["heat"] }]) {
    const { ledger, diagnostic } = applyTeachEvent(emptyTopicLedger(), probeEvent(extra), "A", PROBE_OPTIONS, PROBE_NOW, "Q?");
    assert.equal(diagnostic, undefined, JSON.stringify(extra));
    const [entry] = getSession(ledger).probes;
    assert.equal("strand" in entry, false, JSON.stringify(extra));
    assert.equal(entry.result, "passed");
  }
});

test("applyTeachEvent truncates a long probe question and a long free-text answer to 150 characters", () => {
  const long = "x".repeat(400);
  const { ledger } = applyTeachEvent(emptyTopicLedger(), probeEvent(), long, PROBE_OPTIONS, PROBE_NOW, long);
  const [entry] = getSession(ledger).probes;
  assert.equal(entry.question.length, 151, "150 characters plus the ellipsis");
  assert.equal(entry.answer.length, 151);
  assert.ok(entry.question.endsWith("…") && entry.answer.endsWith("…"));
});

test("applyTeachEvent stores nothing for a probe that has no string answer", () => {
  for (const answer of [undefined, null, 42]) {
    const { ledger, diagnostic } = applyTeachEvent(emptyTopicLedger(), probeEvent(), answer, PROBE_OPTIONS, PROBE_NOW, "Q?");
    assert.match(diagnostic, /probe has no answer, nothing recorded/, String(answer));
    assert.equal(getSession(ledger)?.probes, undefined, `no probe may be stored for ${String(answer)}`);
  }
});

test("applyTeachEvent stores nothing and returns a diagnostic for a probe whose correct matches no option", () => {
  const { ledger, diagnostic } = applyTeachEvent(emptyTopicLedger(), probeEvent({ correct: "Z" }), "A", PROBE_OPTIONS, PROBE_NOW, "Q?");
  assert.match(diagnostic, /probe correct value "Z" does not match any option label/);
  assert.equal(getSession(ledger)?.probes, undefined, "no probe may be stored");
});

test("applyTeachEvent appends to a log that holds an old entry with no result, and leaves that entry as it was", () => {
  const old = { question: "Old Q", answer: "Old A", at: "2025-12-01T00:00:00.000Z" };
  let tl = touchSession(emptyTopicLedger(), PROBE_NOW);
  tl = { ...tl, session: { ...tl.session, probes: [old] } };
  const { ledger } = applyTeachEvent(tl, probeEvent(), "A", PROBE_OPTIONS, PROBE_NOW, "New Q");
  const probes = getSession(ledger).probes;
  assert.deepEqual(probes[0], old);
  assert.equal(probes[1].result, "passed");
});

test("applyTeachEvent sets the goal for a 'goal' event", () => {
  const event = { app: "sensei-teach", v: 1, kind: "goal", topic: "javascript", goal: "understand fundamentals" };
  const { ledger } = applyTeachEvent(emptyTopicLedger(), event, "n/a", [], new Date("2026-01-01T00:00:00.000Z"));
  assert.equal(getSession(ledger).goal, "understand fundamentals");
});

test("applyTeachEvent sets the plan for a 'plan' event when the answer matches the tag's approve label, for any wording", () => {
  const plan = { nodes: ["primitives"], edges: [] };
  const now = new Date("2026-01-01T00:00:00.000Z");
  const event = { app: "sensei-teach", v: 1, kind: "plan", topic: "javascript", plan, approve: "Sounds great, let's begin" };
  const approved = applyTeachEvent(emptyTopicLedger(), event, "Sounds great, let's begin", ["Sounds great, let's begin", "Let me change something"], now);
  assert.equal(approved.ledger.session.status, "planned");

  const otherWording = { ...event, approve: "Yep, go ahead" };
  const approvedDifferentWording = applyTeachEvent(emptyTopicLedger(), otherWording, "Yep, go ahead", ["Yep, go ahead", "Not yet"], now);
  assert.equal(approvedDifferentWording.ledger.session.status, "planned", "approval must not depend on any specific wording");
});

test("applyTeachEvent does not set the plan when the answer is the non-approve option or free-text 'Other'", () => {
  const plan = { nodes: ["primitives"], edges: [] };
  const now = new Date("2026-01-01T00:00:00.000Z");
  const event = { app: "sensei-teach", v: 1, kind: "plan", topic: "javascript", plan, approve: "Sounds great, let's begin" };
  const labels = ["Sounds great, let's begin", "Let me change something"];
  const declinedOption = applyTeachEvent(emptyTopicLedger(), event, "Let me change something", labels, now);
  assert.equal(declinedOption.ledger.session.status, "intake");
  assert.equal(declinedOption.diagnostic, undefined, "a plain decline is not a malformed call");

  const declinedOther = applyTeachEvent(emptyTopicLedger(), event, "Actually let's change the order first", labels, now);
  assert.equal(declinedOther.ledger.session.status, "intake", "an 'Other' answer must not match the approve label");
});

test("applyTeachEvent returns a diagnostic and does not set the plan when the approve label matches no option", () => {
  const plan = { nodes: ["primitives"], edges: [] };
  const now = new Date("2026-01-01T00:00:00.000Z");
  const event = { app: "sensei-teach", v: 1, kind: "plan", topic: "javascript", plan, approve: "Looks good" };
  const result = applyTeachEvent(emptyTopicLedger(), event, "Looks good", ["Sounds great", "Not yet"], now);
  assert.match(result.diagnostic, /approve/);
  assert.equal(result.ledger.session.status, "intake", "a malformed approval call must leave the session unplanned");
});

test("applyTeachEvent returns a diagnostic and does not set the plan when a 'plan' event carries no approve label", () => {
  const plan = { nodes: ["primitives"], edges: [] };
  const event = { app: "sensei-teach", v: 1, kind: "plan", topic: "javascript", plan };
  const result = applyTeachEvent(emptyTopicLedger(), event, "Sounds great", ["Sounds great", "Not yet"], new Date("2026-01-01T00:00:00.000Z"));
  assert.match(result.diagnostic, /approve/);
  assert.equal(result.ledger.session.status, "intake");
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

test("main() writes a diagnostic and no ledger for a non-'other' kind that is missing its topic", () => {
  const configDir = freshConfigDir();
  const env = { ...process.env, CLAUDE_CONFIG_DIR: configDir };
  const source = JSON.stringify({ app: "sensei-teach", v: 1, kind: "goal", goal: "understand fundamentals" });
  execFileSync(process.execPath, [SCRIPT], {
    input: JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: "AskUserQuestion",
      tool_input: { questions: [{ question: "Goal?", options: [{ label: "a" }, { label: "b" }] }], metadata: { source } },
      tool_response: { answers: { "Goal?": "a" } },
    }),
    env,
  });
  const lines = readFileSyncNode(join(configDir, "sensei", "mastery-hook-debug.log"), "utf8").trim().split("\n");
  const entry = JSON.parse(lines[lines.length - 1]);
  assert.match(entry.diagnostic, /goal.*topic/);
  withEnv(env, () => assert.equal(existsSync(ledgersDir()), false, "a topicless goal event must not create any ledger"));
});

test("main() does not crash on a null option entry and still records the event", () => {
  const configDir = freshConfigDir();
  const env = { ...process.env, CLAUDE_CONFIG_DIR: configDir };
  const source = JSON.stringify({ app: "sensei-teach", v: 1, kind: "other", topic: "javascript" });
  execFileSync(process.execPath, [SCRIPT], {
    input: JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: "AskUserQuestion",
      tool_input: { questions: [{ question: "Pick?", options: [null, { label: "b" }] }], metadata: { source } },
      tool_response: { answers: { "Pick?": "b" } },
    }),
    env,
  });
  withEnv(env, () => {
    const ledger = JSON.parse(readFileSyncNode(topicLedgerPath("javascript"), "utf8"));
    assert.ok(ledger.session);
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

function wrapPayload({ transcript, topic = "dns", done = "I'm done", answer, omitDone = false }) {
  const source = { app: "sensei-teach", v: 1, kind: "wrap", topic };
  if (!omitDone) source.done = done;
  const question = "Anything else you want to learn?";
  return {
    hook_event_name: "PostToolUse",
    tool_name: "AskUserQuestion",
    transcript_path: transcript,
    tool_input: { questions: [{ question, options: [{ label: "I'm done" }, { label: "Learn something else" }] }], metadata: { source: JSON.stringify(source) } },
    tool_response: { answers: answer === undefined ? {} : { [question]: answer } },
  };
}

function runWrap(env, payload) {
  execFileSync(process.execPath, [SCRIPT], { input: JSON.stringify(payload), env });
}

function seedLedger(env, topic, passedIds = ["a"]) {
  let tl = setSessionPlan(emptyTopicLedger(), { nodes: ["a", "b"], edges: [] }, new Date("2026-01-01T00:00:00.000Z"));
  for (const id of passedIds) tl = recordNode(tl, id, "passed", new Date("2026-01-01T00:00:00.000Z"));
  tl = advanceSession(tl, new Date("2026-01-01T00:00:00.000Z"));
  withEnv(env, () => writeTopicLedger(topic, tl));
  return withEnv(env, () => topicLedgerPath(topic));
}

function freshTranscript() {
  return join(mkdtempSync(join(tmpdir(), "mastery-record-wrap-")), "session.jsonl");
}

test("main() clears the enforcement marker when a wrap is answered with the done label, and leaves the ledger byte-identical", () => {
  const env = { ...process.env, CLAUDE_CONFIG_DIR: freshConfigDir() };
  const file = seedLedger(env, "dns");
  const before = readFileSyncNode(file, "utf8");
  const transcript = freshTranscript();
  markActive(transcript);
  runWrap(env, wrapPayload({ transcript, answer: "I'm done" }));
  assert.equal(isActive(transcript), false);
  assert.equal(readFileSyncNode(file, "utf8"), before);
});

test("main() keeps the marker and the ledger when a wrap is answered with another option", () => {
  const env = { ...process.env, CLAUDE_CONFIG_DIR: freshConfigDir() };
  const file = seedLedger(env, "dns");
  const before = readFileSyncNode(file, "utf8");
  const transcript = freshTranscript();
  markActive(transcript);
  runWrap(env, wrapPayload({ transcript, answer: "Learn something else" }));
  assert.equal(isActive(transcript), true);
  assert.equal(readFileSyncNode(file, "utf8"), before);
});

test("main() keeps the marker when a wrap is answered with free-text Other", () => {
  const env = { ...process.env, CLAUDE_CONFIG_DIR: freshConfigDir() };
  const transcript = freshTranscript();
  markActive(transcript);
  runWrap(env, wrapPayload({ transcript, answer: "actually, one more thing" }));
  assert.equal(isActive(transcript), true);
});

test("main() does not clear the marker when the tag has no done label and the call has no answer", () => {
  const env = { ...process.env, CLAUDE_CONFIG_DIR: freshConfigDir() };
  const transcript = freshTranscript();
  markActive(transcript);
  runWrap(env, wrapPayload({ transcript, omitDone: true, answer: undefined }));
  assert.equal(isActive(transcript), true, "undefined must never equal undefined here");
});

test("main() clears the marker for a topic with no ledger file and creates no ledger file", () => {
  const env = { ...process.env, CLAUDE_CONFIG_DIR: freshConfigDir() };
  const transcript = freshTranscript();
  markActive(transcript);
  runWrap(env, wrapPayload({ transcript, topic: "never-recorded", answer: "I'm done" }));
  assert.equal(isActive(transcript), false);
  assert.equal(existsSync(withEnv(env, () => topicLedgerPath("never-recorded"))), false);
});

test("main() survives a wrap payload with no transcript_path", () => {
  const env = { ...process.env, CLAUDE_CONFIG_DIR: freshConfigDir() };
  assert.doesNotThrow(() => runWrap(env, wrapPayload({ transcript: undefined, answer: "I'm done" })));
});

test("main() keeps a complete session complete and an in-progress session in-progress when a wrap is answered done", () => {
  for (const [passed, status] of [[["a", "b"], "complete"], [["a"], "in-progress"]]) {
    const env = { ...process.env, CLAUDE_CONFIG_DIR: freshConfigDir() };
    const file = seedLedger(env, "dns", passed);
    const transcript = freshTranscript();
    markActive(transcript);
    runWrap(env, wrapPayload({ transcript, answer: "I'm done" }));
    assert.equal(JSON.parse(readFileSyncNode(file, "utf8")).session.status, status);
    assert.equal(isActive(transcript), false);
  }
});

function runRecord(env, payload) {
  return execFileSync(process.execPath, [SCRIPT], { input: JSON.stringify(payload), env, encoding: "utf8" });
}

function answeredPayload(kind, extra = {}) {
  const tag = { app: "sensei-teach", v: 1, kind, topic: "dns", ...extra };
  return {
    hook_event_name: "PostToolUse",
    tool_name: "AskUserQuestion",
    tool_input: { questions: [{ question: "Q?", options: [{ label: "A" }, { label: "B" }] }], metadata: { source: JSON.stringify(tag) } },
    tool_response: { answers: { "Q?": "A" } },
  };
}

test("main() adds a hidden reminder to explain as chat text after a plan or node answer", () => {
  const env = { ...process.env, CLAUDE_CONFIG_DIR: freshConfigDir() };
  for (const [kind, extra] of [["plan", { approve: "A", plan: { nodes: ["a"], edges: [] } }], ["node", { node: "a", recordAs: "graded", correct: "A" }]]) {
    const out = JSON.parse(runRecord(env, answeredPayload(kind, extra)));
    assert.equal(out.hookSpecificOutput.hookEventName, "PostToolUse");
    assert.match(out.hookSpecificOutput.additionalContext, /chat text/);
    assert.match(out.hookSpecificOutput.additionalContext, /never mention this reminder/i);
  }
});

test("main() prints no reminder for other kinds or an untagged call", () => {
  const env = { ...process.env, CLAUDE_CONFIG_DIR: freshConfigDir() };
  assert.equal(runRecord(env, answeredPayload("other")), "");
  assert.equal(runRecord(env, answeredPayload("probe", { correct: "A" })), "");
  assert.equal(runRecord(env, answeredPayload("wrap", { done: "A" })), "");
  const untagged = answeredPayload("other");
  untagged.tool_input.metadata = {};
  assert.equal(runRecord(env, untagged), "");
});

// A call with several questions: one event per question, graded against that question's own answer.
function batchPayload(kind, items, answers, extra = {}) {
  const questions = items.map((_, i) => ({ question: `Q${i + 1}?`, options: [{ label: "A" }, { label: "B" }, { label: "I don't know" }] }));
  return {
    hook_event_name: "PostToolUse",
    tool_name: "AskUserQuestion",
    tool_input: { questions, metadata: { source: JSON.stringify({ app: "sensei-teach", v: 1, kind, topic: "dns", items, ...extra }) } },
    tool_response: { answers: Object.fromEntries(answers.map((a, i) => [`Q${i + 1}?`, a])) },
  };
}
const nodeItem = (node, correct) => ({ node, recordAs: "graded", correct });
const readLedger = (env, topic = "dns") => JSON.parse(readFileSyncNode(withEnv(env, () => topicLedgerPath(topic)), "utf8"));

test("main() records every node of a multi-question call from its own answer", () => {
  const env = { ...process.env, CLAUDE_CONFIG_DIR: freshConfigDir() };
  runRecord(env, batchPayload("node", [nodeItem("n1", "A"), nodeItem("n2", "B"), nodeItem("n3", "A")], ["A", "A", "I don't know"]));
  const nodes = readLedger(env).nodes;
  assert.equal(nodes.n1.status, "passed");
  assert.equal(nodes.n2.status, "failed");
  assert.equal(nodes.n3.status, "failed");
});

test("main() records every probe of a multi-question call, each with its own strand", () => {
  const env = { ...process.env, CLAUDE_CONFIG_DIR: freshConfigDir() };
  runRecord(env, batchPayload("probe", [{ correct: "A", strand: "Heat" }, { correct: "B", strand: "peeling" }], ["A", "A"]));
  const probes = readLedger(env).session.probes;
  assert.deepEqual(probes.map((p) => [p.question, p.result, p.strand]), [["Q1?", "passed", "heat"], ["Q2?", "failed", "peeling"]]);
});

test("main() still records the other items when one item has a correct label that is not an option", () => {
  const env = { ...process.env, CLAUDE_CONFIG_DIR: freshConfigDir() };
  runRecord(env, batchPayload("node", [nodeItem("n1", "ZZ"), nodeItem("n2", "A")], ["A", "A"]));
  const nodes = readLedger(env).nodes;
  assert.equal(nodes.n1, undefined);
  assert.equal(nodes.n2.status, "passed");
});

test("main() reminder names the missed question and asks for a verdict and a re-explanation", () => {
  const env = { ...process.env, CLAUDE_CONFIG_DIR: freshConfigDir() };
  const out = JSON.parse(runRecord(env, batchPayload("node", [nodeItem("n1", "A"), nodeItem("n2", "B")], ["A", "I don't know"])));
  const text = out.hookSpecificOutput.additionalContext;
  assert.match(text, /Q2\?/);
  assert.doesNotMatch(text, /Q1\?/);
  assert.match(text, /verdict/);
  assert.match(text, /re-explain/);
  assert.match(text, /do not call any tool in this turn/);
  assert.match(text, /never mention this reminder/i);
});

test("main() reminder asks only for short verdicts when every answer was right", () => {
  const env = { ...process.env, CLAUDE_CONFIG_DIR: freshConfigDir() };
  const text = JSON.parse(runRecord(env, batchPayload("node", [nodeItem("n1", "A")], ["A"]))).hookSpecificOutput.additionalContext;
  assert.match(text, /short verdict/);
  assert.doesNotMatch(text, /re-explain/);
});

test("main() gives a probe call no reminder", () => {
  const env = { ...process.env, CLAUDE_CONFIG_DIR: freshConfigDir() };
  assert.equal(runRecord(env, batchPayload("probe", [{ correct: "A" }], ["A"])), "");
});
