import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { isSlug, vaultRoot, nodeFile, mapFile } from "./paths.mjs";

test("isSlug accepts lowercase words joined by hyphens and rejects everything else", () => {
  for (const ok of ["dns", "tcp-handshake", "a1", "http2"]) assert.equal(isSlug(ok), true, ok);
  for (const bad of ["", "-a", "A", "a b", "a/b", "../x", "a_b", ".hidden", "é", 5, null, undefined]) {
    assert.equal(isSlug(bad), false, String(bad));
  }
});

test("vaultRoot is <vault>/sensei, trimmed, and null when nothing usable is configured", () => {
  assert.equal(vaultRoot("/v"), resolve("/v", "sensei"));
  assert.equal(vaultRoot("  /v  "), resolve("/v", "sensei"));
  for (const none of [undefined, null, "", "   ", 7]) assert.equal(vaultRoot(none), null);
});

test("nodeFile and mapFile build paths under the root", () => {
  const root = resolve("/v", "sensei");
  assert.equal(nodeFile(root, "dns", "referrals"), resolve(root, "dns", "referrals.md"));
  assert.equal(mapFile(root, "dns"), resolve(root, "dns", "_map.md"));
});

test("nodeFile and mapFile refuse a slug that could leave the root", () => {
  const root = resolve("/v", "sensei");
  assert.throws(() => nodeFile(root, "..", "x"), /invalid topic/);
  assert.throws(() => nodeFile(root, "dns", "../../etc/passwd"), /invalid node/);
  assert.throws(() => nodeFile(root, "dns", ""), /invalid node/);
  assert.throws(() => mapFile(root, "a/b"), /invalid topic/);
});
