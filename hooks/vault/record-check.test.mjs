import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { activePath } from "./state.mjs";
import { emptyTopicLedger, setSessionGoal, setSessionPlan, writeTopicLedger } from "../../scripts/mastery.mjs";

const SCRIPT = fileURLToPath(new URL("./record-check.mjs", import.meta.url));
const PLAN = { nodes: ["delegation", "referrals"], edges: [["delegation", "referrals"]] };

function setup({ withVault = true } = {}) {
  const config = mkdtempSync(join(tmpdir(), "rc-config-"));
  const vault = mkdtempSync(join(tmpdir(), "rc-vault-"));
  const env = { CLAUDE_CONFIG_DIR: config, CLAUDE_PLUGIN_OPTION_VAULT_PATH: withVault ? vault : "" };
  return { config, vault, env };
}

function run(payload, env) {
  execFileSync("node", [SCRIPT], { input: JSON.stringify(payload), env: { ...process.env, ...env } });
}

function payload({ tag, questions, answers, sessionId = "sess-1" }) {
  return {
    hook_event_name: "PostToolUse",
    tool_name: "AskUserQuestion",
    session_id: sessionId,
    transcript_path: "/tmp/none.jsonl",
    tool_input: {
      questions: questions.map((q) => ({ question: q.question, options: q.options.map((label) => ({ label, description: label })) })),
      metadata: { source: JSON.stringify({ app: "sensei-teach", v: 1, ...tag }) },
    },
    tool_response: { answers },
  };
}

const NODE_TAG = { kind: "node", topic: "dns", node: "referrals", recordAs: "graded", correct: "Ask the next server" };
const Q = { question: "What does a referral do?", options: ["Ask the next server", "Return the final answer", "I don't know"] };

function seedLedger(env) {
  Object.assign(process.env, env); // mastery.mjs reads CLAUDE_CONFIG_DIR from process.env
  let ledger = setSessionGoal(emptyTopicLedger(), "Understand DNS");
  ledger = setSessionPlan(ledger, PLAN);
  writeTopicLedger("dns", ledger);
}

test("a correct graded check writes the card, the attempt and the active file", () => {
  const { vault, env } = setup();
  seedLedger(env);
  run(payload({ tag: NODE_TAG, questions: [Q], answers: { [Q.question]: "Ask the next server" } }), env);
  const note = readFileSync(join(vault, "sensei", "dns", "referrals.md"), "utf8");
  assert.ok(note.includes('requires: ["[[sensei/dns/delegation|delegation]]"]'));
  assert.ok(note.includes("What does a referral do?\n?\nAsk the next server\n"));
  assert.ok(note.includes("> ✓ Answered correctly."));
  assert.deepEqual(JSON.parse(readFileSync(activePath("sess-1", env), "utf8")), { topic: "dns" });
});

test("a wrong pick and an I don't know are recorded as they were chosen", () => {
  const { vault, env } = setup();
  seedLedger(env);
  run(payload({ tag: NODE_TAG, questions: [Q], answers: { [Q.question]: "Return the final answer" } }), env);
  run(payload({ tag: NODE_TAG, questions: [Q], answers: { [Q.question]: "I don't know" } }), env);
  const note = readFileSync(join(vault, "sensei", "dns", "referrals.md"), "utf8");
  assert.ok(note.includes('> ✗ Picked "Return the final answer". Correct answer above.'), "first pick: the card was just written");
  assert.ok(note.includes('> Said "I don\'t know" on "What does a referral do?".'), "second pick: the card already existed");
});

test("free text typed under Other is recorded as the pick", () => {
  const { vault, env } = setup();
  seedLedger(env);
  run(payload({ tag: NODE_TAG, questions: [Q], answers: { [Q.question]: "it asks\nthe root again" } }), env);
  assert.ok(readFileSync(join(vault, "sensei", "dns", "referrals.md"), "utf8").includes('Picked "it asks the root again"'));
});

test("an unanswered question writes no note", () => {
  const { vault, env } = setup();
  seedLedger(env);
  run(payload({ tag: NODE_TAG, questions: [Q], answers: {} }), env);
  assert.equal(existsSync(join(vault, "sensei", "dns", "referrals.md")), false);
});

test("a batched call writes one card per question", () => {
  const { vault, env } = setup();
  seedLedger(env);
  const Q2 = { question: "What does a delegation do?", options: ["Hands a zone to another server", "Caches", "I don't know"] };
  const tag = {
    kind: "node", topic: "dns", recordAs: "graded",
    items: [
      { node: "referrals", correct: "Ask the next server" },
      { node: "delegation", correct: "Hands a zone to another server" },
    ],
  };
  run(payload({ tag, questions: [Q, Q2], answers: { [Q.question]: "Ask the next server", [Q2.question]: "Caches" } }), env);
  assert.ok(existsSync(join(vault, "sensei", "dns", "referrals.md")));
  assert.ok(readFileSync(join(vault, "sensei", "dns", "delegation.md"), "utf8").includes('Picked "Caches"'));
});

test("a node ID that is not a slug is skipped and logged, the other questions still write", () => {
  const { vault, env, config } = setup();
  seedLedger(env);
  run(payload({ tag: { ...NODE_TAG, node: "../evil" }, questions: [Q], answers: { [Q.question]: "Ask the next server" } }), env);
  assert.equal(existsSync(join(vault, "sensei")), false);
  assert.ok(readFileSync(join(config, "sensei", "vault-debug.log"), "utf8").includes("invalid node"));
});

test("with no vault the hook writes no note but still records the active topic", () => {
  const { env, vault } = setup({ withVault: false });
  seedLedger(env);
  run(payload({ tag: NODE_TAG, questions: [Q], answers: { [Q.question]: "Ask the next server" } }), env);
  assert.equal(existsSync(join(vault, "sensei")), false);
  assert.equal(existsSync(activePath("sess-1", env)), true);
});

test("an approved plan writes _map.md with the ledger's goal; a refused plan writes nothing", () => {
  const { vault, env } = setup();
  seedLedger(env);
  const tag = { kind: "plan", topic: "dns", approve: "Looks good", plan: PLAN };
  const q = { question: "Happy with the plan?", options: ["Looks good", "I have changes"] };
  run(payload({ tag, questions: [q], answers: { [q.question]: "I have changes" } }), env);
  assert.equal(existsSync(join(vault, "sensei", "dns", "_map.md")), false);
  run(payload({ tag, questions: [q], answers: { [q.question]: "Looks good" } }), env);
  const map = readFileSync(join(vault, "sensei", "dns", "_map.md"), "utf8");
  assert.ok(map.includes('goal: "Understand DNS"'));
  assert.ok(map.includes("n0 --> n1"));
});

test("a confirmed wrap removes the active file; any other answer leaves it", () => {
  const { env } = setup();
  seedLedger(env);
  run(payload({ tag: NODE_TAG, questions: [Q], answers: { [Q.question]: "Ask the next server" } }), env);
  const wrapQ = { question: "Done for today?", options: ["I'm done", "Keep going"] };
  const wrap = { kind: "wrap", topic: "dns", done: "I'm done" };
  run(payload({ tag: wrap, questions: [wrapQ], answers: { [wrapQ.question]: "Keep going" } }), env);
  assert.equal(existsSync(activePath("sess-1", env)), true);
  run(payload({ tag: wrap, questions: [wrapQ], answers: { [wrapQ.question]: "I'm done" } }), env);
  assert.equal(existsSync(activePath("sess-1", env)), false);
});

test("an untagged AskUserQuestion, a non-AskUserQuestion payload and bad JSON all do nothing and exit 0", () => {
  const { vault, env } = setup();
  const untagged = payload({ tag: {}, questions: [Q], answers: {} });
  untagged.tool_input.metadata = {};
  run(untagged, env);
  run({ hook_event_name: "PostToolUse", tool_name: "Bash" }, env);
  assert.doesNotThrow(() => execFileSync("node", [SCRIPT], { input: "not json", env: { ...process.env, ...env } }));
  assert.equal(existsSync(join(vault, "sensei")), false);
});
