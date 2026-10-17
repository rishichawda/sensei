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
    dependencyMap: {
      nodes: ["ip-routing", "delegation", "referrals"],
      edges: [["ip-routing", "delegation"], ["delegation", "referrals"]],
      labels: { "ip-routing": "How packets find a machine", delegation: "Who answers for a domain", referrals: "Following a referral" },
    },
  },
};
const PROPOSED = { version: 1, nodes: {}, session: { goal: "Understand DNS", status: "intake", dependencyMap: null, nextNodeId: null, proposedPlan: { nodes: ["a", "b"], edges: [["a", "b"]], labels: { a: "The first idea", b: "The second idea" } } } };

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
  assert.deepEqual(bandLine(LEDGER), BAND("✗", "Step 2 of 3 · Retry: Who answers for a domain", "red", { last: "How packets find a machine" }));
  assert.deepEqual(bandLine({ ...LEDGER, nodes: {} }), BAND("●", "Step 1 of 3 · In progress: Who answers for a domain", "cyan"));
  const batch = { ...LEDGER, nodes: { "ip-routing": { status: "passed", lastTaughtAt: "2026-10-10T05:00:00.000Z" }, delegation: { status: "passed", lastTaughtAt: "2026-10-10T05:00:00.000Z" } }, session: { ...LEDGER.session, nextNodeId: "referrals" } };
  assert.equal(bandLine(batch).last, "Who answers for a domain", "a tie goes to the later step in the plan");
  const earlier = { ...batch, nodes: { ...batch.nodes, "ip-routing": { status: "passed", lastTaughtAt: "2026-10-10T06:00:00.000Z" } } };
  assert.equal(bandLine(earlier).last, "How packets find a machine", "otherwise the step taught last");
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
  assert.deepEqual(bandLine(approved), BAND("●", "Step 1 of 3 · In progress: How packets find a machine", "cyan"));
});

test("chipLabel shows the glyph and the label only", () => {
  assert.equal(chipLabel(LEDGER, "delegation"), "✗ Who answers for a domain");
  assert.equal(chipLabel(LEDGER, "ip-routing"), "✓ How packets find a machine");
  assert.equal(chipLabel({ ...LEDGER, nodes: {} }, "referrals"), "○ Following a referral");
  assert.equal(chipLabel(PROPOSED, "b"), "○ The second idea", "a proposed plan draws its labels too");
});

test("snapshot and changedStatuses give one line for a newly passed or failed node only", () => {
  const before = snapshot("dns", LEDGER);
  const withNodes = (nodes) => snapshot("dns", { ...LEDGER, nodes: { ...LEDGER.nodes, ...nodes } });
  assert.equal(changedStatuses(before, withNodes({ delegation: { status: "passed" } })), "✓ Who answers for a domain");
  assert.equal(changedStatuses(before, withNodes({ referrals: { status: "failed" } })), "✗ Following a referral — retry");
  assert.equal(changedStatuses(before, before), null);
  assert.equal(changedStatuses(null, before), null);
  assert.equal(changedStatuses(before, null), null);
  assert.equal(changedStatuses(snapshot("other", LEDGER), before), null, "a different topic never toasts");
  assert.equal(snapshot("dns", null), null);
});

test("changedStatuses reports a repeated result: a second miss on a step that already failed", () => {
  const at = (iso, status) => ({ ...LEDGER, nodes: { delegation: { status, lastTaughtAt: iso } } });
  const first = snapshot("dns", at("2026-10-10T05:00:00.000Z", "failed"));
  const again = snapshot("dns", at("2026-10-10T05:09:00.000Z", "failed"));
  assert.equal(changedStatuses(first, again), "✗ Who answers for a domain — retry");
  assert.equal(changedStatuses(first, snapshot("dns", at("2026-10-10T05:00:00.000Z", "failed"))), null, "the same result is not reported twice");
  assert.equal(changedStatuses(first, snapshot("dns", at("2026-10-10T05:09:00.000Z", "passed"))), "✓ Who answers for a domain");
  const passed = snapshot("dns", at("2026-10-10T05:00:00.000Z", "passed"));
  assert.equal(changedStatuses(passed, snapshot("dns", at("2026-10-10T05:09:00.000Z", "passed"))), "✓ Who answers for a domain", "a re-check that passes again");
});

test("changedStatuses counts the questions of the last round, not the steps", () => {
  const before = snapshot("dns", { ...LEDGER, nodes: {} });
  const withNodes = (nodes) => snapshot("dns", { ...LEDGER, nodes });
  const round = (status, right, wrong) => ({ status, lastRound: { right, wrong } });
  assert.equal(changedStatuses(before, withNodes({ delegation: round("failed", 1, 2) })), "✓ 1 correct · ✗ 2 to retry");
  assert.equal(changedStatuses(before, withNodes({ delegation: round("failed", 0, 1) })), "✗ Who answers for a domain — retry", "one question uses the step label");
  assert.equal(changedStatuses(before, withNodes({ delegation: round("passed", 1, 0) })), "✓ Who answers for a domain");
  assert.equal(changedStatuses(before, withNodes({ delegation: round("passed", 2, 0) })), "✓ 2 correct");
  assert.equal(changedStatuses(before, withNodes({ delegation: round("failed", 0, 3) })), "✗ 3 to retry");
  assert.equal(changedStatuses(before, withNodes({ delegation: round("failed", 1, 2), "ip-routing": round("passed", 1, 0) })), "✓ 2 correct · ✗ 2 to retry", "counts add across steps");
  assert.equal(changedStatuses(before, withNodes({ delegation: { status: "failed" }, "ip-routing": round("passed", 2, 0) })), "✓ 2 correct · ✗ 1 to retry", "a step with no counts is one question");
  assert.doesNotThrow(() => snapshot("dns", { ...LEDGER, nodes: { delegation: { status: "failed", lastRound: "x" } } }));
});

test("changedStatuses folds a batch into one line of counts", () => {
  const before = snapshot("dns", { ...LEDGER, nodes: {} });
  const withNodes = (nodes) => snapshot("dns", { ...LEDGER, nodes });
  const two = { "ip-routing": { status: "passed" }, delegation: { status: "failed" } };
  assert.equal(changedStatuses(before, withNodes(two)), "✓ 1 correct · ✗ 1 to retry");
  assert.equal(changedStatuses(before, withNodes({ "ip-routing": { status: "passed" }, delegation: { status: "passed" } })), "✓ 2 correct");
  assert.equal(changedStatuses(before, withNodes({ "ip-routing": { status: "failed" }, delegation: { status: "failed" } })), "✗ 2 to retry");
  const seen = snapshot("dns", { ...LEDGER, nodes: { "ip-routing": { status: "seen" } } });
  assert.equal(changedStatuses(seen, withNodes({ "ip-routing": { status: "seen" } })), null, "a status that is neither passed nor failed says nothing");
});

test("nodeDetail lists neighbours and the date taught", () => {
  assert.deepEqual(nodeDetail(LEDGER, "delegation"), {
    name: "Who answers for a domain", status: "failed", prerequisites: ["How packets find a machine"], dependents: ["Following a referral"], taught: "2026-10-10",
  });
  assert.deepEqual(nodeDetail(LEDGER, "referrals"), { name: "Following a referral", status: "not started", prerequisites: ["Who answers for a domain"], dependents: [], taught: null });
});

test("nodeDetail calls the node being taught in progress, the same state glyph draws as current", () => {
  const started = { ...LEDGER, nodes: {} };
  assert.equal(nodeDetail(started, "delegation").status, "in progress");
  assert.equal(glyph(started, "delegation"), "●");
});


test("a proposed plan is drawn from the ledger but never counted as progress", () => {
  assert.deepEqual(proposedPlan(PROPOSED), { nodes: ["a", "b"], edges: [["a", "b"]], labels: { a: "The first idea", b: "The second idea" } });
  assert.equal(proposedPlan(LEDGER), null, "an approved plan is not a proposal");
  assert.equal(proposedPlan({ ...PROPOSED, session: { ...PROPOSED.session, proposedPlan: { nodes: "a" } } }), null);
  assert.deepEqual(progress(PROPOSED), { passed: 0, total: 0 });
    assert.equal(nodeDetail(PROPOSED, "b").status, "proposed");
  assert.deepEqual(nodeDetail(PROPOSED, "b").prerequisites, ["The first idea"]);
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
