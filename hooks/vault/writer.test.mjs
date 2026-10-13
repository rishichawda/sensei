import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { recordCheck, recordDigest, writeMap } from "./writer.mjs";
import { debugLogPath } from "./state.mjs";

function setup() {
  const config = mkdtempSync(join(tmpdir(), "vault-config-"));
  const vault = mkdtempSync(join(tmpdir(), "vault-"));
  return { vault, env: { CLAUDE_CONFIG_DIR: config, CLAUDE_PLUGIN_OPTION_VAULT_PATH: vault } };
}
const noteOf = (vault, topic, node) => join(vault, "sensei", topic, `${node}.md`);
const base = { topic: "dns", node: "referrals", sessionId: "s1", now: new Date(2026, 9, 13, 14, 5), requires: ["delegation"] };

test("recordCheck creates the note with frontmatter, deck tag, session section, card and attempt", () => {
  const { vault, env } = setup();
  assert.equal(recordCheck({ ...base, env, question: "What is a referral?", answer: "A pointer to the next server", picked: "A pointer to the next server", result: "passed" }), true);
  assert.equal(
    readFileSync(noteOf(vault, "dns", "referrals"), "utf8"),
    [
      "---", "topic: dns", "node: referrals", 'requires: ["[[sensei/dns/delegation|delegation]]"]', "---",
      "#flashcards/dns/referrals", "", "## 2026-10-13 14:05", "<!-- sensei:session s1 -->", "",
      "What is a referral?", "?", "A pointer to the next server", "", "> ✓ Answered correctly.", "",
    ].join("\n"),
  );
});

test("a second entry in the same session adds no new section", () => {
  const { vault, env } = setup();
  recordCheck({ ...base, env, question: "Q1?", answer: "A1", picked: "A1", result: "passed" });
  recordDigest({ ...base, env, kind: "explained", digest: "Short digest." });
  const text = readFileSync(noteOf(vault, "dns", "referrals"), "utf8");
  assert.equal(text.match(/## 2026/g).length, 1);
  assert.ok(text.endsWith("\n**Explained:** Short digest.\n"));
});

test("a later session adds a section, and a re-asked question adds no second card", () => {
  const { vault, env } = setup();
  recordCheck({ ...base, env, question: "Q1?", answer: "A1", picked: "A1", result: "passed" });
  recordCheck({ ...base, env, sessionId: "s2", now: new Date(2026, 9, 15, 9, 30), question: "Q1?", answer: "A1", picked: "B", result: "failed" });
  const text = readFileSync(noteOf(vault, "dns", "referrals"), "utf8");
  assert.equal(text.match(/\nQ1\?\n\?\nA1\n/g).length, 1);
  assert.ok(text.includes("## 2026-10-15 09:30\n<!-- sensei:session s2 -->"));
  assert.ok(text.endsWith('> ✗ Picked "B" on "Q1?". Correct answer: A1\n'));
});

test("earlier bytes never change, even after Obsidian adds a schedule comment to a card", () => {
  const { vault, env } = setup();
  recordCheck({ ...base, env, question: "Q1?", answer: "A1", picked: "A1", result: "passed" });
  const file = noteOf(vault, "dns", "referrals");
  writeFileSync(file, readFileSync(file, "utf8").replace("\nA1\n", "\nA1 <!--SR:!2026-10-20,4,270-->\n"));
  const before = readFileSync(file, "utf8");
  recordCheck({ ...base, env, sessionId: "s2", question: "Q1?", answer: "A1", picked: "A1", result: "passed" });
  recordCheck({ ...base, env, sessionId: "s2", question: "Q2?", answer: "A2", picked: "A2", result: "passed" });
  const after = readFileSync(file, "utf8");
  assert.ok(after.startsWith(before));
  assert.ok(after.includes("A1 <!--SR:!2026-10-20,4,270-->"));
  assert.equal(after.match(/\nQ1\?\n/g).length, 1, "no duplicate card for the schedule-commented question");
});

test("with no vault configured nothing is written and nothing throws", () => {
  const config = mkdtempSync(join(tmpdir(), "vault-config-"));
  const env = { CLAUDE_CONFIG_DIR: config };
  assert.equal(recordCheck({ ...base, env, question: "Q?", answer: "A", picked: "A", result: "passed" }), false);
  assert.equal(recordDigest({ ...base, env, kind: "explained", digest: "x" }), false);
  assert.equal(writeMap({ env, topic: "dns", goal: "g", plan: { nodes: [], edges: [] } }), false);
});

test("a vault folder that does not exist is skipped and logged", () => {
  const config = mkdtempSync(join(tmpdir(), "vault-config-"));
  const env = { CLAUDE_CONFIG_DIR: config, CLAUDE_PLUGIN_OPTION_VAULT_PATH: join(config, "missing") };
  assert.equal(recordCheck({ ...base, env, question: "Q?", answer: "A", picked: "A", result: "passed" }), false);
  assert.ok(readFileSync(debugLogPath(env), "utf8").includes("vault directory not found"));
  assert.equal(existsSync(join(config, "missing")), false);
});

test("a vault path that is a file is skipped and logged", () => {
  const config = mkdtempSync(join(tmpdir(), "vault-config-"));
  const file = join(config, "afile");
  writeFileSync(file, "x");
  const env = { CLAUDE_CONFIG_DIR: config, CLAUDE_PLUGIN_OPTION_VAULT_PATH: file };
  assert.equal(recordDigest({ ...base, env, kind: "explained", digest: "x" }), false);
  assert.ok(readFileSync(debugLogPath(env), "utf8").includes("vault directory not found"));
});

test("a topic or node that is not a slug writes nothing and is logged", () => {
  const { vault, env } = setup();
  for (const bad of [{ topic: "../escape" }, { node: "../../x" }, { node: "" }, { topic: "A b" }]) {
    assert.equal(recordCheck({ ...base, ...bad, env, question: "Q?", answer: "A", picked: "A", result: "passed" }), false);
  }
  assert.equal(existsSync(join(vault, "sensei")), false);
  assert.ok(readFileSync(debugLogPath(env), "utf8").includes("invalid"));
});

test("writeMap writes _map.md and may overwrite its own file", () => {
  const { vault, env } = setup();
  const plan = { nodes: ["a", "b"], edges: [["a", "b"]] };
  assert.equal(writeMap({ env, topic: "dns", goal: "g", plan }), true);
  const file = join(vault, "sensei", "dns", "_map.md");
  assert.ok(readFileSync(file, "utf8").includes("sensei-owned: true"));
  assert.equal(writeMap({ env, topic: "dns", goal: "g2", plan: { nodes: ["a"], edges: [] } }), true);
  assert.ok(readFileSync(file, "utf8").includes('goal: "g2"'));
});

test("writeMap refuses to overwrite a _map.md the user made their own", () => {
  const { vault, env } = setup();
  const file = join(vault, "sensei", "dns", "_map.md");
  mkdirSync(join(vault, "sensei", "dns"), { recursive: true });
  writeFileSync(file, "my own notes\n");
  assert.equal(writeMap({ env, topic: "dns", goal: "g", plan: { nodes: [], edges: [] } }), false);
  assert.equal(readFileSync(file, "utf8"), "my own notes\n");
  assert.ok(readFileSync(debugLogPath(env), "utf8").includes("not sensei-owned"));
});
