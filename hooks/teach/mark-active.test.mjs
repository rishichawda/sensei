import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { isMasteryInvocation } from "./mark-active.mjs";
import { markTeachInvoked } from "./session-state.mjs";

const SCRIPT = fileURLToPath(new URL("./mark-active.mjs", import.meta.url));

function freshTranscriptPath() {
  const dir = mkdtempSync(join(tmpdir(), "mark-active-test-"));
  return join(dir, "session.jsonl");
}

function markerPathFor(transcriptPath) {
  return `${transcriptPath}.teach-active-state.json`;
}

test("main() marks active for a Bash command that runs scripts/mastery.mjs once teach was invoked in the session", () => {
  const transcript = freshTranscriptPath();
  markTeachInvoked(transcript);
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

test("main() marks active when the mastery.mjs command failed (PostToolUseFailure)", () => {
  const transcript = freshTranscriptPath();
  markTeachInvoked(transcript);
  execFileSync(process.execPath, [SCRIPT], {
    input: JSON.stringify({
      hook_event_name: "PostToolUseFailure",
      tool_name: "Bash",
      tool_input: { command: 'node "/plugin/scripts/mastery.mjs" --help' },
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

const INVOCATIONS = [
  'node "/plugin/scripts/mastery.mjs" topics',
  'node "${CLAUDE_PLUGIN_ROOT}/scripts/mastery.mjs" get "javascript"',
  "node /Users/me/sensei/scripts/mastery.mjs get-session graph-theory-basics",
  "node scripts/mastery.mjs record some-topic node-1 seen",
  'cd /repo && node "/plugin/scripts/mastery.mjs" topics',
  'CLAUDE_CONFIG_DIR=/tmp/x node scripts/mastery.mjs topics',
  'node --no-warnings "/plugin/scripts/mastery.mjs" get "t"',
  'cd /repo\nnode scripts/mastery.mjs topics',
  'echo start\nnode "/plugin/scripts/mastery.mjs" get "t"\necho done',
];

const NON_INVOCATIONS = [
  'grep -n "export function setSessionPlan" -A12 scripts/mastery.mjs',
  "git diff scripts/mastery.mjs",
  "cat scripts/mastery.mjs",
  "sed -n 1,20p scripts/mastery.mjs",
  "wc -l scripts/mastery.mjs",
  "node --test hooks/teach/mastery-record.test.mjs",
  `node -e "import('/x/scripts/mastery.mjs')"`,
  "echo node scripts/mastery.mjs topics",
  "ls scripts",
];

for (const command of INVOCATIONS) {
  test(`isMasteryInvocation is true for a real CLI run: ${command}`, () => {
    assert.equal(isMasteryInvocation(command), true);
  });
}

for (const command of NON_INVOCATIONS) {
  test(`isMasteryInvocation is false for a command that only mentions or reads the file: ${command}`, () => {
    assert.equal(isMasteryInvocation(command), false);
  });
}

test("main() does not mark active for a grep of scripts/mastery.mjs, so a dev session reading the file is never enforced", () => {
  const transcript = freshTranscriptPath();
  execFileSync(process.execPath, [SCRIPT], {
    input: JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: "Bash",
      tool_input: { command: "grep -n recordNode scripts/mastery.mjs" },
      transcript_path: transcript,
    }),
  });
  assert.equal(existsSync(markerPathFor(transcript)), false);
});

test("main() does not mark active when scripts/mastery.mjs is run in a session that never invoked teach, so a developer inspecting a ledger is not enforced", () => {
  const transcript = freshTranscriptPath();
  execFileSync(process.execPath, [SCRIPT], {
    input: JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: "Bash",
      tool_input: { command: 'node "/plugin/scripts/mastery.mjs" get-session "t"' },
      transcript_path: transcript,
    }),
  });
  assert.equal(existsSync(markerPathFor(transcript)), false);
});
