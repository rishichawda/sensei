import { test } from "node:test";
import assert from "node:assert/strict";
import { mapNoteText } from "./map.mjs";

const PLAN = { nodes: ["ip-routing", "delegation", "referrals"], edges: [["ip-routing", "delegation"], ["delegation", "referrals"], ["ghost", "referrals"]] };

test("mapNoteText is sensei-owned and carries the goal, a mermaid map and a wikilink per concept", () => {
  const text = mapNoteText({ topic: "dns-resolution", goal: "Understand \"how DNS works\"", plan: PLAN });
  assert.ok(text.startsWith("---\nsensei-owned: true\ntopic: dns-resolution\n"));
  assert.ok(text.includes('goal: "Understand \\"how DNS works\\""'));
  assert.ok(text.includes("```mermaid\ngraph TD\n"));
  assert.ok(text.includes('  n0["ip routing"]'));
  assert.ok(text.includes("  n0 --> n1"));
  assert.ok(text.includes("  n1 --> n2"));
  assert.ok(!text.includes("ghost"), "an edge to an unknown node is dropped");
  assert.ok(text.includes("- [[sensei/dns-resolution/referrals|referrals]]"));
});

test("mapNoteText omits the goal when there is none and tolerates an empty plan", () => {
  const text = mapNoteText({ topic: "t", goal: null, plan: { nodes: [], edges: [] } });
  assert.ok(!text.includes("goal:"));
  assert.ok(text.includes("graph TD"));
  assert.doesNotThrow(() => mapNoteText({ topic: "t", plan: undefined }));
});
