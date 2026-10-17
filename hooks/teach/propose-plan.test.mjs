import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handlePayload } from "./propose-plan.mjs";
import { readTopicLedger } from "../../scripts/mastery.mjs";

const PLAN = { nodes: ["a", "b"], edges: [["a", "b"]], labels: { a: "The first idea", b: "The second idea" } };

function payload(tag, extra = {}) {
  return {
    hook_event_name: "PreToolUse",
    tool_name: "AskUserQuestion",
    tool_input: {
      metadata: { source: JSON.stringify({ app: "sensei-teach", v: 1, ...tag }) },
      questions: [{ question: "Approve?", options: [{ label: "Approve" }, { label: "Change it" }] }],
    },
    ...extra,
  };
}

function withConfig(fn) {
  const saved = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = mkdtempSync(join(tmpdir(), "propose-plan-test-"));
  try {
    fn();
  } finally {
    if (saved === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = saved;
  }
}

test("a valid plan question stores the plan as proposed, not approved", () => {
  withConfig(() => {
    handlePayload(payload({ kind: "plan", topic: "dns", plan: PLAN, approve: "Approve" }));
    const { session } = readTopicLedger("dns");
    assert.deepEqual(session.proposedPlan, PLAN);
    assert.equal(session.dependencyMap, null);
    assert.equal(session.status, "intake");
  });
});

test("a malformed plan tag, another kind, another tool or another event stores nothing", () => {
  withConfig(() => {
    handlePayload(payload({ kind: "plan", topic: "dns", plan: { nodes: "a" }, approve: "Approve" }));
    handlePayload(payload({ kind: "plan", topic: "dns", plan: PLAN, approve: "No such label" }));
    handlePayload(payload({ kind: "goal", topic: "dns", goal: "g" }));
    handlePayload({ ...payload({ kind: "plan", topic: "dns", plan: PLAN, approve: "Approve" }), tool_name: "Bash" });
    handlePayload({ ...payload({ kind: "plan", topic: "dns", plan: PLAN, approve: "Approve" }), hook_event_name: "PostToolUse" });
    assert.equal(readTopicLedger("dns").session, null);
  });
});
