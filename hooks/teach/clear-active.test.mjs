import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("./clear-active.mjs", import.meta.url));

function freshTranscriptPath() {
  const dir = mkdtempSync(join(tmpdir(), "clear-active-test-"));
  return join(dir, "session.jsonl");
}

function markerPathFor(transcriptPath) {
  return `${transcriptPath}.teach-active-state.json`;
}

test("main() clears an existing marker for this transcript", () => {
  const transcript = freshTranscriptPath();
  writeFileSync(markerPathFor(transcript), JSON.stringify({ active: true }), "utf8");
  execFileSync(process.execPath, [SCRIPT], { input: JSON.stringify({ transcript_path: transcript }) });
  assert.equal(existsSync(markerPathFor(transcript)), false);
});

test("main() is a no-op when there was never a marker", () => {
  const transcript = freshTranscriptPath();
  assert.doesNotThrow(() =>
    execFileSync(process.execPath, [SCRIPT], { input: JSON.stringify({ transcript_path: transcript }) }),
  );
});

test("main() survives unparseable JSON on stdin without crashing", () => {
  assert.doesNotThrow(() => execFileSync(process.execPath, [SCRIPT], { input: "not json" }));
});
