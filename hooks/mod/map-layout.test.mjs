import { test } from "node:test";
import assert from "node:assert/strict";
import { layers, progress, glyph, bandText, snapshot, changedStatuses, nodeDetail, proposedPlan } from "./map-layout.mjs";

const LEDGER = {
  version: 1,
  nodes: {
    "ip-routing": { status: "passed", lastTaughtAt: "2026-10-10T04:35:00.702Z" },
    delegation: { status: "failed", lastTaughtAt: "2026-10-10T05:00:00.000Z" },
  },
  session: {
    goal: "Understand DNS",
    status: "in-progress",
    nextNodeId: "delegation",
    dependencyMap: { nodes: ["ip-routing", "delegation", "referrals"], edges: [["ip-routing", "delegation"], ["delegation", "referrals"]] },
  },
};

test("layers puts a chain on separate rows, a diamond's middle on one, and keeps order", () => {
  assert.deepEqual(layers(["a", "b", "c"], [["a", "b"], ["b", "c"]]), [["a"], ["b"], ["c"]]);
  assert.deepEqual(layers(["a", "b", "c", "d"], [["a", "b"], ["a", "c"], ["b", "d"], ["c", "d"]]), [["a"], ["b", "c"], ["d"]]);
  assert.deepEqual(layers(["x", "y"], []), [["x", "y"]]);
});

test("layers survives cycles, self-loops, duplicates, unknown ids and empty input", () => {
  assert.deepEqual(layers(["a", "b", "c"], [["a", "b"], ["b", "a"]]), [["c"], ["a", "b"]]);
  assert.deepEqual(layers(["a"], [["a", "a"]]), [["a"]]);
  assert.deepEqual(layers(["a", "a", "b"], [["a", "b"], ["a", "b"], ["ghost", "b"]]), [["a"], ["b"]]);
  assert.deepEqual(layers([], []), []);
  assert.deepEqual(layers(undefined, undefined), []);
});

test("progress counts passed nodes of the plan", () => {
  assert.deepEqual(progress(LEDGER), { passed: 1, total: 3 });
  assert.deepEqual(progress({ nodes: {}, session: null }), { passed: 0, total: 0 });
  assert.deepEqual(progress(null), { passed: 0, total: 0 });
});

test("glyph: passed, failed, current, pending", () => {
  assert.equal(glyph(LEDGER, "ip-routing"), "✓");
  assert.equal(glyph(LEDGER, "delegation"), "✗");
  assert.equal(glyph({ ...LEDGER, nodes: {} }, "delegation"), "●");
  assert.equal(glyph(LEDGER, "referrals"), "○");
});

test("bandText per session state", () => {
  assert.equal(bandText(LEDGER), "Step 2 of 3 · delegation · retry");
  assert.equal(bandText({ ...LEDGER, nodes: {} }), "Step 1 of 3 · delegation · check pending");
  const s = (extra) => ({ ...LEDGER, session: { ...LEDGER.session, ...extra } });
  assert.equal(bandText(s({ status: "intake" })), "Planning · Understand DNS");
  assert.equal(bandText(s({ status: "planned" })), "Plan ready · 3 steps · Understand DNS");
  assert.equal(bandText(s({ status: "complete" })), "All 3 steps passed");
  assert.equal(bandText({ nodes: {}, session: null }), null);
  assert.equal(bandText(null), null);
});

test("snapshot and changedStatuses give a toast for a newly passed or failed node only", () => {
  const before = snapshot("dns", LEDGER);
  const after = snapshot("dns", { ...LEDGER, nodes: { ...LEDGER.nodes, delegation: { status: "passed" }, referrals: { status: "failed" } } });
  assert.deepEqual(changedStatuses(before, after), ["✓ delegation", "✗ referrals — retry"]);
  assert.deepEqual(changedStatuses(before, before), []);
  assert.deepEqual(changedStatuses(null, after), []);
  assert.deepEqual(changedStatuses(before, null), []);
  assert.deepEqual(changedStatuses(snapshot("other", LEDGER), after), [], "a different topic never toasts");
  assert.equal(snapshot("dns", null), null);
});

test("nodeDetail lists neighbours and the date taught", () => {
  assert.deepEqual(nodeDetail(LEDGER, "delegation"), {
    name: "delegation", status: "failed", prerequisites: ["ip routing"], dependents: ["referrals"], taught: "2026-10-10",
  });
  assert.deepEqual(nodeDetail(LEDGER, "referrals"), { name: "referrals", status: "not started", prerequisites: ["delegation"], dependents: [], taught: null });
});

test("nodeDetail calls the node being taught in progress, the same state glyph draws as current", () => {
  const started = { ...LEDGER, nodes: {} };
  assert.equal(nodeDetail(started, "delegation").status, "in progress");
  assert.equal(glyph(started, "delegation"), "●");
});

const PROPOSED = { version: 1, nodes: {}, session: { goal: "Understand DNS", status: "intake", dependencyMap: null, nextNodeId: null, proposedPlan: { nodes: ["a", "b"], edges: [["a", "b"]] } } };

test("a proposed plan is drawn from the ledger but never counted as progress", () => {
  assert.deepEqual(proposedPlan(PROPOSED), { nodes: ["a", "b"], edges: [["a", "b"]] });
  assert.equal(proposedPlan(LEDGER), null, "an approved plan is not a proposal");
  assert.equal(proposedPlan({ ...PROPOSED, session: { ...PROPOSED.session, proposedPlan: { nodes: "a" } } }), null);
  assert.deepEqual(progress(PROPOSED), { passed: 0, total: 0 });
  assert.equal(bandText(PROPOSED), "Plan proposed · 2 steps · Understand DNS");
  assert.equal(nodeDetail(PROPOSED, "b").status, "proposed");
  assert.deepEqual(nodeDetail(PROPOSED, "b").prerequisites, ["a"]);
  assert.notDeepEqual(snapshot("dns", PROPOSED), snapshot("dns", { ...PROPOSED, session: { ...PROPOSED.session, proposedPlan: null } }), "a new proposal changes the snapshot");
});
