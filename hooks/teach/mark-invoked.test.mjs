import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { isTeachInvoked } from "./session-state.mjs";

const SCRIPT = fileURLToPath(new URL("./mark-invoked.mjs", import.meta.url));

function run(payload) {
  const transcript = join(mkdtempSync(join(tmpdir(), "mark-invoked-test-")), "session.jsonl");
  execFileSync(process.execPath, [SCRIPT], { input: JSON.stringify({ ...payload, transcript_path: transcript }) });
  return isTeachInvoked(transcript);
}

const prompt = (text) => ({ hook_event_name: "UserPromptSubmit", prompt: text });
const skill = (name) => ({ hook_event_name: "PostToolUse", tool_name: "Skill", tool_input: { skill: name, args: "x" } });

test("a typed /sensei:teach prompt marks the session as having invoked teach", () => {
  assert.equal(run(prompt("/sensei:teach how to boil an egg")), true);
  assert.equal(run(prompt("/sensei:teach")), true);
});

test("a prompt that only mentions /sensei:teach does not mark", () => {
  assert.equal(run(prompt("please run /sensei:teach for me")), false);
  assert.equal(run(prompt("/sensei:teacher-notes")), false);
  assert.equal(run(prompt("teach me how to boil an egg")), false);
});

test("a Skill tool call for sensei:teach marks the session", () => {
  assert.equal(run(skill("sensei:teach")), true);
});

test("a Skill tool call for another skill does not mark", () => {
  assert.equal(run(skill("sensei:visualize")), false);
  assert.equal(run(skill("superpowers:brainstorming")), false);
});

test("a non-Skill tool whose input names sensei:teach does not mark", () => {
  assert.equal(run({ hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { skill: "sensei:teach" } }), false);
});

test("a payload with no transcript_path writes nothing and does not crash", () => {
  assert.doesNotThrow(() => execFileSync(process.execPath, [SCRIPT], { input: JSON.stringify(prompt("/sensei:teach x")) }));
});

test("unparseable JSON on stdin does not crash", () => {
  assert.doesNotThrow(() => execFileSync(process.execPath, [SCRIPT], { input: "not json" }));
});
