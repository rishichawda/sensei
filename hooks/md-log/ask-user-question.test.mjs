// sensei/hooks/md-log/ask-user-question.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { handlePreToolUse, handlePostToolUse, handlePostToolUseFailure } from "./ask-user-question.mjs";

test("PreToolUse on AskUserQuestion logs the question before it's answered", () => {
  const out = handlePreToolUse({
    tool_name: "AskUserQuestion",
    tool_input: {
      questions: [
        { question: "Pick a number", header: "Number", options: [{ label: "1" }, { label: "2" }] },
      ],
    },
  });
  assert.match(out, /Pick a number/);
  assert.match(out, /1\. 1/);
});

test("PreToolUse falls back to 'Question' when header is missing", () => {
  const out = handlePreToolUse({
    tool_name: "AskUserQuestion",
    tool_input: { questions: [{ question: "Pick a number", options: [{ label: "1" }] }] },
  });
  assert.match(out, /Question/);
});

test("PreToolUse logs each question in a multi-question call, with its own callout", () => {
  const out = handlePreToolUse({
    tool_name: "AskUserQuestion",
    tool_input: {
      questions: [
        { question: "Pick a number", header: "Number", options: [{ label: "1" }, { label: "2" }] },
        { question: "Pick a color", header: "Color", options: [{ label: "Red" }, { label: "Blue" }] },
      ],
    },
  });
  assert.match(out, /Pick a number/);
  assert.match(out, /Pick a color/);
  assert.match(out, /Red/);
});

test("PreToolUse ignores other tools", () => {
  assert.equal(handlePreToolUse({ tool_name: "Bash", tool_input: {} }), null);
});

test("PreToolUse returns null when tool_input.questions is missing or not an array", () => {
  assert.equal(handlePreToolUse({ tool_name: "AskUserQuestion", tool_input: {} }), null);
  assert.equal(
    handlePreToolUse({ tool_name: "AskUserQuestion", tool_input: { questions: "nope" } }),
    null,
  );
});

test("PostToolUse on AskUserQuestion logs the answer", () => {
  const out = handlePostToolUse({
    tool_name: "AskUserQuestion",
    tool_response: { answers: [{ label: "42" }] },
  });
  assert.match(out, /42/);
});

test("PostToolUse ignores other tools", () => {
  assert.equal(handlePostToolUse({ tool_name: "Bash", tool_response: {} }), null);
});

test("PostToolUseFailure on AskUserQuestion logs a cancelled callout", () => {
  const out = handlePostToolUseFailure({ tool_name: "AskUserQuestion" });
  assert.match(out, /cancelled/i);
});

test("PostToolUseFailure ignores other tools", () => {
  assert.equal(handlePostToolUseFailure({ tool_name: "Bash" }), null);
});
