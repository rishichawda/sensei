import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const hooksJson = JSON.parse(readFileSync(fileURLToPath(new URL("./hooks.json", import.meta.url)), "utf8"));

test("no hook removes the teach-active marker, so a teach session stays enforced across turns", () => {
  const commands = Object.values(hooksJson.hooks)
    .flat()
    .flatMap((entry) => entry.hooks.map((h) => h.command));
  assert.deepEqual(commands.filter((c) => /clear-active/.test(c)), []);
});

test("mark-invoked runs on every prompt and after every Skill call, the two ways teach is started", () => {
  const registered = (event, matcher) =>
    (hooksJson.hooks[event] ?? [])
      .filter((entry) => entry.matcher === matcher)
      .flatMap((entry) => entry.hooks.map((h) => h.command))
      .some((c) => /hooks\/teach\/mark-invoked\.mjs/.test(c));
  assert.equal(registered("UserPromptSubmit", undefined), true);
  assert.equal(registered("PostToolUse", "Skill"), true);
});

test("no hook command references the removed md-log hooks", () => {
  const commands = Object.values(hooksJson.hooks)
    .flat()
    .flatMap((entry) => entry.hooks.map((h) => h.command));
  assert.deepEqual(commands.filter((c) => /md-log/.test(c)), []);
});

test("the vault hooks are registered: sync at SessionStart and on every prompt, record after every AskUserQuestion result", () => {
  const registered = (event, matcher, script) =>
    (hooksJson.hooks[event] ?? [])
      .filter((entry) => entry.matcher === matcher)
      .flatMap((entry) => entry.hooks.map((h) => h.command))
      .some((c) => c.includes(script));
  assert.equal(registered("SessionStart", undefined, "hooks/vault/sync-state.mjs"), true);
  assert.equal(registered("UserPromptSubmit", undefined, "hooks/vault/sync-state.mjs"), true);
  assert.equal(registered("PostToolUse", "AskUserQuestion", "hooks/vault/record-check.mjs"), true);
});

test("propose-plan runs before every AskUserQuestion, beside the tag check", () => {
  const commands = (hooksJson.hooks.PreToolUse ?? [])
    .filter((entry) => entry.matcher === "AskUserQuestion")
    .flatMap((entry) => entry.hooks.map((h) => h.command));
  assert.equal(commands.some((c) => c.includes("hooks/teach/propose-plan.mjs")), true);
});
