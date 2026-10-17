import { test } from "node:test";
import assert from "node:assert/strict";
import { mapNoteText } from "./map.mjs";

const PLAN = {
  nodes: ["ip-routing", "delegation", "referrals"],
  edges: [["ip-routing", "delegation"], ["delegation", "referrals"], ["ghost", "referrals"]],
  labels: { "ip-routing": "How packets find a machine", delegation: "Who answers for a domain", referrals: "Following a referral" },
};

test("mapNoteText is sensei-owned and carries the goal, a mermaid map and a wikilink per concept", () => {
  const text = mapNoteText({ topic: "dns-resolution", goal: "Understand \"how DNS works\"", plan: PLAN });
  assert.ok(text.startsWith("---\nsensei-owned: true\ntopic: dns-resolution\n"));
  assert.ok(text.includes('goal: "Understand \\"how DNS works\\""'));
  assert.ok(text.includes("```mermaid\ngraph TD\n"));
  assert.ok(text.includes("<!-- sensei: do not rename this file or change the sensei-owned line;"), "the file warns what not to change");
  assert.ok(text.includes('  n0["How packets find a machine"]'));
  assert.ok(text.includes("  n0 --> n1"));
  assert.ok(text.includes("  n1 --> n2"));
  assert.ok(!text.includes("ghost"), "an edge to an unknown node is dropped");
  assert.ok(text.includes("- [[sensei/dns resolution/Following a referral|Following a referral]]"), "the link names the topic folder in words and the note by its label");
});

test("mapNoteText omits the goal when there is none and tolerates an empty plan", () => {
  const text = mapNoteText({ topic: "t", goal: null, plan: { nodes: [], edges: [] } });
  assert.ok(!text.includes("goal:"));
  assert.ok(text.includes("graph TD"));
  assert.doesNotThrow(() => mapNoteText({ topic: "t", plan: undefined }));
});

test("mapNoteText escapes a quote in a label and links the note name a label makes", () => {
  const plan = { nodes: ["a"], edges: [], labels: { a: 'Why "TCP/IP" works' } };
  const text = mapNoteText({ topic: "t", goal: null, plan });
  assert.ok(text.includes('n0["Why #quot;TCP/IP#quot; works"]'));
  assert.ok(text.includes("- [[sensei/t/Why TCP IP works|Why TCP IP works]]"));
});
