import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  callout,
  userBlock,
  assistantBlock,
  questionCallout,
  answerCallout,
  cancelledCallout,
  appendToFile,
  stateFilePathFor,
  readState,
  writeState,
} from "./lib.mjs";

test("callout formats an Obsidian callout block", () => {
  const out = callout("quote", "YOU", ["line one", "", "line two"]);
  assert.equal(out, "> [!quote] YOU\n> line one\n>\n> line two");
});

test("userBlock and assistantBlock wrap with the right callout type", () => {
  assert.match(userBlock("hi"), /^> \[!quote\] YOU/);
  assert.match(assistantBlock("hi"), /^> \[!abstract\] CLAUDE/);
});

test("questionCallout lists numbered options", () => {
  const out = questionCallout("Question", "Pick one", [{ label: "A" }, { label: "B" }]);
  assert.match(out, /1\. A/);
  assert.match(out, /2\. B/);
});

test("answerCallout renders selected answers", () => {
  const out = answerCallout(["A"]);
  assert.match(out, /A/);
});

test("cancelledCallout marks the question as dismissed", () => {
  const out = cancelledCallout();
  assert.match(out, /cancelled/i);
});

test("appendToFile creates the file on first write and appends after", () => {
  const dir = mkdtempSync(join(tmpdir(), "md-log-test-"));
  const file = join(dir, "log.md");
  appendToFile(file, "first");
  appendToFile(file, "second");
  const content = readFileSync(file, "utf8");
  assert.match(content, /first[\s\S]*second/);
});

test("appendToFile has no leading separator on a new file and a blank-line separator between entries", () => {
  const dir = mkdtempSync(join(tmpdir(), "md-log-test-"));
  const file = join(dir, "log.md");
  appendToFile(file, "first");
  appendToFile(file, "second");
  const content = readFileSync(file, "utf8");
  assert.equal(content, "first\n\n\nsecond\n");
});

test("state file lives alongside the transcript and round-trips", () => {
  const dir = mkdtempSync(join(tmpdir(), "md-log-test-"));
  const transcriptPath = join(dir, "session123.jsonl");
  const statePath = stateFilePathFor(transcriptPath);
  assert.equal(statePath, join(dir, "session123.md-log-state.json"));
  assert.deepEqual(readState(transcriptPath), { file: null });
  writeState(transcriptPath, { file: "/vault/lesson.md" });
  assert.deepEqual(readState(transcriptPath), { file: "/vault/lesson.md" });
  assert.ok(existsSync(statePath));
});
