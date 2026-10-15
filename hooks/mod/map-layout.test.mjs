import { test } from "node:test";
import assert from "node:assert/strict";
import { layers, progress, glyph, chipLabel, bandLine, snapshot, changedStatuses, nodeDetail, proposedPlan, goalOf } from "./map-layout.mjs";

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
const PROPOSED = { version: 1, nodes: {}, session: { goal: "Understand DNS", status: "intake", dependencyMap: null, nextNodeId: null, proposedPlan: { nodes: ["a", "b"], edges: [["a", "b"]] } } };

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

const BAND = (glyph, head, tone, extra = {}) => ({ glyph, head, tone, detail: null, last: null, animated: false, ...extra });

test("bandLine describes the step in progress, a retry and the step passed last", () => {
  assert.deepEqual(bandLine(LEDGER), BAND("✗", "Step 2 of 3 · Retry: delegation", "red", { last: "ip routing" }));
  assert.deepEqual(bandLine({ ...LEDGER, nodes: {} }), BAND("●", "Step 1 of 3 · In progress: delegation", "cyan"));
  const batch = { ...LEDGER, nodes: { "ip-routing": { status: "passed", lastTaughtAt: "2026-10-10T05:00:00.000Z" }, delegation: { status: "passed", lastTaughtAt: "2026-10-10T05:00:00.000Z" } }, session: { ...LEDGER.session, nextNodeId: "referrals" } };
  assert.equal(bandLine(batch).last, "delegation", "a tie goes to the later step in the plan");
  const earlier = { ...batch, nodes: { ...batch.nodes, "ip-routing": { status: "passed", lastTaughtAt: "2026-10-10T06:00:00.000Z" } } };
  assert.equal(bandLine(earlier).last, "ip routing", "otherwise the step taught last");
});

test("bandLine colours only the state, and puts the goal in the detail", () => {
  const s = (extra) => ({ ...LEDGER, nodes: {}, session: { ...LEDGER.session, ...extra } });
  assert.deepEqual(bandLine(s({ status: "intake", nextNodeId: null })), BAND("◌", "Planning", undefined, { detail: "Understand DNS", animated: true }));
  assert.deepEqual(bandLine(PROPOSED), BAND("◇", "Plan proposed · 2 steps", "yellow", { detail: "Understand DNS" }));
  assert.deepEqual(bandLine(s({ status: "complete" })), BAND("✓", "All 3 steps passed", "green"));
  assert.equal(bandLine({ nodes: {}, session: null }), null);
  assert.equal(bandLine(null), null);
});

test("an approved plan shows progress at once, before any check is recorded", () => {
  const approved = { ...LEDGER, nodes: {}, session: { ...LEDGER.session, status: "planned", nextNodeId: "ip-routing" } };
  assert.deepEqual(bandLine(approved), BAND("●", "Step 1 of 3 · In progress: ip routing", "cyan"));
});

test("chipLabel shows the glyph, the name and what the step needs", () => {
  assert.equal(chipLabel(LEDGER, "delegation"), "✗ delegation ← ip routing");
  assert.equal(chipLabel(LEDGER, "ip-routing"), "✓ ip routing");
  assert.equal(chipLabel({ ...LEDGER, nodes: {} }, "referrals"), "○ referrals ← delegation");
  assert.equal(chipLabel(PROPOSED, "b"), "○ b ← a", "a proposed plan draws its prerequisites too");
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


test("a proposed plan is drawn from the ledger but never counted as progress", () => {
  assert.deepEqual(proposedPlan(PROPOSED), { nodes: ["a", "b"], edges: [["a", "b"]] });
  assert.equal(proposedPlan(LEDGER), null, "an approved plan is not a proposal");
  assert.equal(proposedPlan({ ...PROPOSED, session: { ...PROPOSED.session, proposedPlan: { nodes: "a" } } }), null);
  assert.deepEqual(progress(PROPOSED), { passed: 0, total: 0 });
    assert.equal(nodeDetail(PROPOSED, "b").status, "proposed");
  assert.deepEqual(nodeDetail(PROPOSED, "b").prerequisites, ["a"]);
});

// A hand-edited or corrupt ledger must not crash the mod's pane or band.
test("a ledger with wrong-typed plan, edges or goal never throws and reads as empty", () => {
  const bad = (session, nodes) => ({ version: 1, nodes: nodes ?? {}, session });
  assert.deepEqual(progress(bad({ dependencyMap: { nodes: "abc", edges: [] } })), { passed: 0, total: 0 });
  assert.deepEqual(progress(bad({ dependencyMap: "oops" })), { passed: 0, total: 0 });
  assert.equal(proposedPlan(bad({ proposedPlan: { nodes: "abc" } })), null);
  const detail = nodeDetail(bad({ dependencyMap: { nodes: ["a"], edges: "nope" } }), "a");
  assert.deepEqual([detail.prerequisites, detail.dependents], [[], []]);
  assert.equal(goalOf(bad({ goal: { text: "x" } })), null);
  assert.equal(goalOf(bad({ goal: "" })), null);
  assert.equal(goalOf(bad({ goal: "Learn DNS" })), "Learn DNS");
  assert.equal(bandLine(bad({ status: "intake", goal: { text: "x" } })), null);
  assert.equal(bandLine(bad({ status: "intake", proposedPlan: { nodes: ["a"], edges: [] }, goal: ["x"] })).detail, null);
  assert.doesNotThrow(() => snapshot("t", bad({ status: 5 }, "not an object")));
});
