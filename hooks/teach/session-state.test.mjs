import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { markActive, isActive, clearActive } from "./session-state.mjs";

function freshTranscriptPath() {
  const dir = mkdtempSync(join(tmpdir(), "teach-session-state-test-"));
  return join(dir, "session.jsonl");
}

test("isActive is false for a transcript that was never marked", () => {
  assert.equal(isActive(freshTranscriptPath()), false);
});

test("markActive then isActive returns true", () => {
  const transcript = freshTranscriptPath();
  markActive(transcript);
  assert.equal(isActive(transcript), true);
});

test("marking one transcript does not affect a sibling transcript", () => {
  const a = freshTranscriptPath();
  const b = freshTranscriptPath();
  markActive(a);
  assert.equal(isActive(a), true);
  assert.equal(isActive(b), false);
});

test("clearActive removes the marker so isActive is false again", () => {
  const transcript = freshTranscriptPath();
  markActive(transcript);
  clearActive(transcript);
  assert.equal(isActive(transcript), false);
});

test("clearActive on a transcript that was never marked does nothing and does not throw", () => {
  const transcript = freshTranscriptPath();
  assert.doesNotThrow(() => clearActive(transcript));
  assert.equal(isActive(transcript), false);
});

test("clearActive leaves a sibling transcript's marker alone", () => {
  const a = freshTranscriptPath();
  const b = freshTranscriptPath();
  markActive(a);
  markActive(b);
  clearActive(a);
  assert.equal(isActive(a), false);
  assert.equal(isActive(b), true);
});

test("a cleared session can be marked active again", () => {
  const transcript = freshTranscriptPath();
  markActive(transcript);
  clearActive(transcript);
  markActive(transcript);
  assert.equal(isActive(transcript), true);
});
