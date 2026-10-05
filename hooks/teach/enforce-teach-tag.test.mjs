import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkDeny } from "./enforce-teach-tag.mjs";
import { markActive } from "./session-state.mjs";

const SCRIPT = fileURLToPath(new URL("./enforce-teach-tag.mjs", import.meta.url));

function freshTranscriptPath() {
  const dir = mkdtempSync(join(tmpdir(), "enforce-teach-tag-test-"));
  return join(dir, "session.jsonl");
}

function questionWithOptions(labels) {
  return { questions: [{ question: "Pick one", options: labels.map((label) => ({ label })) }] };
}

test("checkDeny returns null for a non-AskUserQuestion PreToolUse event", () => {
  const payload = { hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: {} };
  assert.equal(checkDeny(payload), null);
});

test("checkDeny returns null for an untagged AskUserQuestion outside an active teach session, regardless of shape (no false positive on an unrelated skill)", () => {
  const transcript = freshTranscriptPath();
  const payload = {
    hook_event_name: "PreToolUse",
    tool_name: "AskUserQuestion",
    tool_input: questionWithOptions(["A", "B", "I don't know"]),
    transcript_path: transcript,
  };
  assert.equal(checkDeny(payload), null);
});

test("checkDeny denies ANY untagged AskUserQuestion inside an active teach session, even a plain preference question with no quiz-shaped option anywhere", () => {
  const transcript = freshTranscriptPath();
  markActive(transcript);
  const payload = {
    hook_event_name: "PreToolUse",
    tool_name: "AskUserQuestion",
    tool_input: questionWithOptions(["Option A", "Option B"]),
    transcript_path: transcript,
  };
  const decision = checkDeny(payload);
  assert.equal(decision.hookSpecificOutput.permissionDecision, "deny");
  assert.match(decision.hookSpecificOutput.permissionDecisionReason, /metadata\.source/);
});

test("checkDeny returns null when the call already carries a valid teach tag, regardless of its option labels", () => {
  const transcript = freshTranscriptPath();
  markActive(transcript);
  const payload = {
    hook_event_name: "PreToolUse",
    tool_name: "AskUserQuestion",
    tool_input: {
      questions: [{ question: "Pick one", options: [{ label: "Yes" }, { label: "No" }] }],
      metadata: { source: JSON.stringify({ app: "sensei-teach", v: 1, kind: "other" }) },
    },
    transcript_path: transcript,
  };
  assert.equal(checkDeny(payload), null);
});

test("checkDeny does not throw for a malformed tool_input (undefined, or missing questions array), inside an active session", () => {
  const transcript = freshTranscriptPath();
  markActive(transcript);
  assert.doesNotThrow(() =>
    checkDeny({ hook_event_name: "PreToolUse", tool_name: "AskUserQuestion", tool_input: undefined, transcript_path: transcript }),
  );
  assert.doesNotThrow(() =>
    checkDeny({ hook_event_name: "PreToolUse", tool_name: "AskUserQuestion", tool_input: {}, transcript_path: transcript }),
  );
});

test("main() prints a deny decision end-to-end for an untagged call in an active session", () => {
  const transcript = freshTranscriptPath();
  markActive(transcript);
  const out = execFileSync(process.execPath, [SCRIPT], {
    input: JSON.stringify({
      hook_event_name: "PreToolUse",
      tool_name: "AskUserQuestion",
      tool_input: questionWithOptions(["Yes", "No"]),
      transcript_path: transcript,
    }),
  });
  const parsed = JSON.parse(out.toString());
  assert.equal(parsed.hookSpecificOutput.permissionDecision, "deny");
});

test("main() prints nothing for a validly tagged call", () => {
  const transcript = freshTranscriptPath();
  markActive(transcript);
  const out = execFileSync(process.execPath, [SCRIPT], {
    input: JSON.stringify({
      hook_event_name: "PreToolUse",
      tool_name: "AskUserQuestion",
      tool_input: {
        questions: [{ question: "Pick one", options: [{ label: "Yes" }, { label: "No" }] }],
        metadata: { source: JSON.stringify({ app: "sensei-teach", v: 1, kind: "other" }) },
      },
      transcript_path: transcript,
    }),
  });
  assert.equal(out.toString(), "");
});

test("main() survives unparseable JSON on stdin without crashing", () => {
  assert.doesNotThrow(() => execFileSync(process.execPath, [SCRIPT], { input: "not json" }));
});
