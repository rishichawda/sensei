import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { isSlug, vaultRoot, nodeFile, mapFile, noteName, topicDir, topicFolder } from "./paths.mjs";

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
  assert.equal(nodeFile(root, "dns", "Following a referral"), resolve(root, "dns", "Following a referral.md"));
  assert.equal(topicDir(root, "dns"), resolve(root, "dns"));
  assert.equal(mapFile(root, "dns"), resolve(root, "dns", "_map.md"));
});

test("nodeFile and mapFile refuse a slug that could leave the root", () => {
  const root = resolve("/v", "sensei");
  assert.throws(() => nodeFile(root, "..", "x"), /invalid topic/);
  assert.throws(() => nodeFile(root, "dns", "../../etc/passwd"), /invalid note name/);
  assert.throws(() => nodeFile(root, "dns", ""), /invalid note name/);
  assert.throws(() => nodeFile(root, "dns", "_map"), /invalid note name/);
  assert.throws(() => mapFile(root, "a/b"), /invalid topic/);
});

test("noteName keeps plain words and removes what breaks a path or a wikilink", () => {
  assert.equal(noteName("Following a referral"), "Following a referral");
  assert.equal(noteName("  Oil and water don't mix  "), "Oil and water don't mix");
  assert.equal(noteName('Why "TCP/IP": a [short] #1 story?'), "Why TCP IP a short 1 story");
  assert.equal(noteName("../../etc/passwd"), "etc passwd");
  assert.equal(noteName("...hidden"), "hidden");
  assert.equal(noteName("a".repeat(150)).length, 100);
  for (const none of ["", "   ", "///", "_map", "_MAP", undefined, null]) assert.equal(noteName(none), null, String(none));
});

test("the topic folder is the slug in words", () => {
  const root = resolve("/v", "sensei");
  assert.equal(topicFolder("camera-lens-cleaning"), "camera lens cleaning");
  assert.equal(topicFolder("dns"), "dns");
  assert.equal(topicDir(root, "dns-resolution"), resolve(root, "dns resolution"));
  assert.equal(nodeFile(root, "dns-resolution", "Referrals"), resolve(root, "dns resolution", "Referrals.md"));
  assert.equal(mapFile(root, "dns-resolution"), resolve(root, "dns resolution", "_map.md"));
  assert.throws(() => topicFolder("../x"), /invalid topic/);
});
