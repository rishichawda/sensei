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

test("clearActive removes the marker", () => {
  const transcript = freshTranscriptPath();
  markActive(transcript);
  clearActive(transcript);
  assert.equal(isActive(transcript), false);
});

test("clearActive is a no-op (does not throw) when nothing was ever marked", () => {
  assert.doesNotThrow(() => clearActive(freshTranscriptPath()));
});

test("marking one transcript does not affect a sibling transcript", () => {
  const a = freshTranscriptPath();
  const b = freshTranscriptPath();
  markActive(a);
  assert.equal(isActive(a), true);
  assert.equal(isActive(b), false);
});
