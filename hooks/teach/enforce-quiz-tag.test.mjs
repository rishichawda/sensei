import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { isQuizProtocolCall, checkDeny } from "./enforce-quiz-tag.mjs";
import { markActive } from "./session-state.mjs";

const SCRIPT = fileURLToPath(new URL("./enforce-quiz-tag.mjs", import.meta.url));

function freshTranscriptPath() {
  const dir = mkdtempSync(join(tmpdir(), "enforce-quiz-tag-test-"));
  return join(dir, "session.jsonl");
}

function questionWithOptions(labels) {
  return { questions: [{ question: "Pick one", options: labels.map((label) => ({ label })) }] };
}

test("isQuizProtocolCall is true when any question has an 'I don't know' option", () => {
  assert.equal(isQuizProtocolCall(questionWithOptions(["A", "B", "I don't know"])), true);
});

test("isQuizProtocolCall is false for a plain preference question with no such option", () => {
  assert.equal(isQuizProtocolCall(questionWithOptions(["Option A", "Option B"])), false);
});

test("isQuizProtocolCall is false for missing/malformed tool_input", () => {
  assert.equal(isQuizProtocolCall(undefined), false);
  assert.equal(isQuizProtocolCall({}), false);
});

test("checkDeny returns null for a non-AskUserQuestion PreToolUse event", () => {
  const payload = { hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: {} };
  assert.equal(checkDeny(payload), null);
});

test("checkDeny returns null when there's no 'I don't know' option, regardless of session state", () => {
  const transcript = freshTranscriptPath();
  markActive(transcript);
  const payload = {
    hook_event_name: "PreToolUse",
    tool_name: "AskUserQuestion",
    tool_input: questionWithOptions(["Yes", "No"]),
    transcript_path: transcript,
  };
  assert.equal(checkDeny(payload), null);
});

test("checkDeny returns null for a quiz-shaped call outside an active teach session (no false positive on an unrelated skill)", () => {
  const transcript = freshTranscriptPath();
  const payload = {
    hook_event_name: "PreToolUse",
    tool_name: "AskUserQuestion",
    tool_input: questionWithOptions(["A", "B", "I don't know"]),
    transcript_path: transcript,
  };
  assert.equal(checkDeny(payload), null);
});

test("checkDeny denies an untagged quiz-shaped call inside an active teach session", () => {
  const transcript = freshTranscriptPath();
  markActive(transcript);
  const payload = {
    hook_event_name: "PreToolUse",
    tool_name: "AskUserQuestion",
    tool_input: questionWithOptions(["A", "B", "I don't know"]),
    transcript_path: transcript,
  };
  const decision = checkDeny(payload);
  assert.equal(decision.hookSpecificOutput.permissionDecision, "deny");
  assert.match(decision.hookSpecificOutput.permissionDecisionReason, /kind:"probe"/);
});

test("checkDeny returns null when the call already carries a valid teach tag", () => {
  const transcript = freshTranscriptPath();
  markActive(transcript);
  const payload = {
    hook_event_name: "PreToolUse",
    tool_name: "AskUserQuestion",
    tool_input: {
      questions: [{ question: "Pick one", options: [{ label: "A" }, { label: "I don't know" }] }],
      metadata: { source: JSON.stringify({ app: "sensei-teach", v: 1, kind: "probe", topic: "javascript" }) },
    },
    transcript_path: transcript,
  };
  assert.equal(checkDeny(payload), null);
});

test("main() prints a deny decision end-to-end for an untagged quiz call in an active session", () => {
  const transcript = freshTranscriptPath();
  markActive(transcript);
  const out = execFileSync(process.execPath, [SCRIPT], {
    input: JSON.stringify({
      hook_event_name: "PreToolUse",
      tool_name: "AskUserQuestion",
      tool_input: questionWithOptions(["A", "B", "I don't know"]),
      transcript_path: transcript,
    }),
  });
  const parsed = JSON.parse(out.toString());
  assert.equal(parsed.hookSpecificOutput.permissionDecision, "deny");
});

test("main() prints nothing for a plain non-quiz question", () => {
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
  assert.equal(out.toString(), "");
});

test("main() survives unparseable JSON on stdin without crashing", () => {
  assert.doesNotThrow(() => execFileSync(process.execPath, [SCRIPT], { input: "not json" }));
});
