import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("./mark-active.mjs", import.meta.url));

function freshTranscriptPath() {
  const dir = mkdtempSync(join(tmpdir(), "mark-active-test-"));
  return join(dir, "session.jsonl");
}

function markerPathFor(transcriptPath) {
  return `${transcriptPath}.teach-active-state.json`;
}

test("main() marks active for a Bash command that runs scripts/mastery.mjs", () => {
  const transcript = freshTranscriptPath();
  execFileSync(process.execPath, [SCRIPT], {
    input: JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: "Bash",
      tool_input: { command: 'node "/plugin/scripts/mastery.mjs" topics' },
      transcript_path: transcript,
    }),
  });
  assert.equal(existsSync(markerPathFor(transcript)), true);
});

test("main() ignores a Bash command unrelated to mastery.mjs", () => {
  const transcript = freshTranscriptPath();
  execFileSync(process.execPath, [SCRIPT], {
    input: JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: "Bash",
      tool_input: { command: "ls -la" },
      transcript_path: transcript,
    }),
  });
  assert.equal(existsSync(markerPathFor(transcript)), false);
});

test("main() ignores a non-Bash tool even if the command string mentions mastery.mjs", () => {
  const transcript = freshTranscriptPath();
  execFileSync(process.execPath, [SCRIPT], {
    input: JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: "Read",
      tool_input: { command: "scripts/mastery.mjs" },
      transcript_path: transcript,
    }),
  });
  assert.equal(existsSync(markerPathFor(transcript)), false);
});

test("main() survives unparseable JSON on stdin without crashing", () => {
  assert.doesNotThrow(() => execFileSync(process.execPath, [SCRIPT], { input: "not json" }));
});
