import { test } from "node:test";
import assert from "node:assert/strict";
import { displayName, prerequisitesOf } from "./graph.mjs";

test("displayName turns hyphens into spaces", () => {
  assert.equal(displayName("tcp-handshake"), "tcp handshake");
  assert.equal(displayName("dns"), "dns");
  assert.equal(displayName("a--b"), "a b");
});

test("prerequisitesOf lists the sources of the edges that end at the node", () => {
  const plan = { nodes: ["a", "b", "c"], edges: [["a", "c"], ["b", "c"], ["a", "b"]] };
  assert.deepEqual(prerequisitesOf(plan, "c"), ["a", "b"]);
  assert.deepEqual(prerequisitesOf(plan, "a"), []);
});

test("prerequisitesOf tolerates a missing or malformed plan", () => {
  assert.deepEqual(prerequisitesOf(null, "a"), []);
  assert.deepEqual(prerequisitesOf({}, "a"), []);
  assert.deepEqual(prerequisitesOf({ edges: ["x", [1, "a"], ["b", "a"]] }, "a"), ["b"]);
});
