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

function taggedCall(event, questions, transcript) {
  return {
    hook_event_name: "PreToolUse",
    tool_name: "AskUserQuestion",
    tool_input: { questions, metadata: { source: JSON.stringify(event) } },
    transcript_path: transcript,
  };
}

const NODE_TAG = { app: "sensei-teach", v: 1, kind: "node", topic: "dns", node: "n1", recordAs: "graded", correct: "B" };

test("checkDeny denies a malformed tag with a reason that names the problem, in an active session", () => {
  const transcript = freshTranscriptPath();
  markActive(transcript);
  const decision = checkDeny(taggedCall({ ...NODE_TAG, correct: "Z" }, questionWithOptions(["A", "B", "I don't know"]).questions, transcript));
  assert.equal(decision.hookSpecificOutput.hookEventName, "PreToolUse");
  assert.equal(decision.hookSpecificOutput.permissionDecision, "deny");
  assert.equal(
    decision.hookSpecificOutput.permissionDecisionReason,
    'This AskUserQuestion call has a malformed sensei-teach tag: node tag: correct "Z" matches none of the option labels ["A","B","I don\'t know"]; set it to the exact label of the correct option. Fix the tag and retry the same call.',
  );
});

test("checkDeny denies a malformed tag even when the session is not active", () => {
  const transcript = freshTranscriptPath();
  const decision = checkDeny(taggedCall({ ...NODE_TAG, topic: undefined }, questionWithOptions(["A", "B"]).questions, transcript));
  assert.equal(decision.hookSpecificOutput.permissionDecision, "deny");
  assert.match(decision.hookSpecificOutput.permissionDecisionReason, /malformed sensei-teach tag: node tag: topic must be a non-empty string\. Fix the tag/);
});

test("checkDeny denies a malformed tag when the payload has no transcript_path", () => {
  const decision = checkDeny(taggedCall({ ...NODE_TAG, v: "1" }, questionWithOptions(["A", "B"]).questions, undefined));
  assert.equal(decision.hookSpecificOutput.permissionDecision, "deny");
});

test("checkDeny joins several problems in one reason", () => {
  const transcript = freshTranscriptPath();
  const questions = [...questionWithOptions(["A", "B"]).questions, ...questionWithOptions(["A", "B"]).questions];
  const decision = checkDeny(taggedCall({ ...NODE_TAG, correct: "Z" }, questions, transcript));
  const reason = decision.hookSpecificOutput.permissionDecisionReason;
  assert.match(reason, /call has 2 questions; send exactly one question per call; node tag: correct "Z" matches none/);
});

test("checkDeny denies a tagged call with no questions and does not throw", () => {
  const transcript = freshTranscriptPath();
  markActive(transcript);
  for (const questions of [undefined, [], "x"]) {
    const decision = checkDeny(taggedCall({ app: "sensei-teach", v: 1, kind: "probe", topic: "dns" }, questions, transcript));
    assert.equal(decision.hookSpecificOutput.permissionDecision, "deny");
  }
});

test("checkDeny allows a valid tag of every recorded kind, active or not", () => {
  const events = [
    [{ app: "sensei-teach", v: 1, kind: "probe", topic: "dns" }, ["A", "B"]],
    [{ app: "sensei-teach", v: 1, kind: "goal", topic: "dns", goal: "g" }, ["A", "B"]],
    [NODE_TAG, ["A", "B", "I don't know"]],
    [{ app: "sensei-teach", v: 1, kind: "plan", topic: "dns", approve: "Looks good", plan: { nodes: ["a", "b"], edges: [["a", "b"]] } }, ["Looks good", "I have changes"]],
    [{ app: "sensei-teach", v: 1, kind: "other" }, ["A", "B"]],
  ];
  for (const active of [false, true]) {
    for (const [event, labels] of events) {
      const transcript = freshTranscriptPath();
      if (active) markActive(transcript);
      assert.equal(checkDeny(taggedCall(event, questionWithOptions(labels).questions, transcript)), null, `${event.kind} active=${active}`);
    }
  }
});

test("checkDeny still treats unparseable or foreign metadata.source as untagged: denied when active, allowed when not", () => {
  const transcript = freshTranscriptPath();
  const call = (source) => ({
    hook_event_name: "PreToolUse",
    tool_name: "AskUserQuestion",
    tool_input: { ...questionWithOptions(["A", "B"]), metadata: { source } },
    transcript_path: transcript,
  });
  assert.equal(checkDeny(call("not json")), null);
  assert.equal(checkDeny(call(JSON.stringify({ app: "other-app", v: 1 }))), null);
  markActive(transcript);
  assert.equal(checkDeny(call("not json")).hookSpecificOutput.permissionDecision, "deny");
  assert.equal(checkDeny(call(JSON.stringify({ app: "other-app", v: 1 }))).hookSpecificOutput.permissionDecision, "deny");
});

test("main() prints a deny decision end-to-end for a malformed tag", () => {
  const transcript = freshTranscriptPath();
  const out = execFileSync(process.execPath, [SCRIPT], {
    input: JSON.stringify(taggedCall({ ...NODE_TAG, correct: "Z" }, questionWithOptions(["A", "B"]).questions, transcript)),
  });
  const parsed = JSON.parse(out.toString());
  assert.equal(parsed.hookSpecificOutput.permissionDecision, "deny");
  assert.match(parsed.hookSpecificOutput.permissionDecisionReason, /^This AskUserQuestion call has a malformed sensei-teach tag:/);
});
