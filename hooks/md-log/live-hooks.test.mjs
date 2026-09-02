import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { handleUserPromptSubmit } from "./user-prompt-submit.mjs";
import { handleStop } from "./stop.mjs";

const USER_PROMPT_SUBMIT_SCRIPT = fileURLToPath(new URL("./user-prompt-submit.mjs", import.meta.url));
const STOP_SCRIPT = fileURLToPath(new URL("./stop.mjs", import.meta.url));
const ASK_USER_QUESTION_SCRIPT = fileURLToPath(new URL("./ask-user-question.mjs", import.meta.url));

test("user-prompt-submit wraps the prompt in a YOU callout", () => {
  const out = handleUserPromptSubmit({ prompt: "What is TCP?" });
  assert.match(out, /^> \[!quote\] YOU[\s\S]*What is TCP\?/);
});

test("user-prompt-submit returns null for an empty prompt", () => {
  assert.equal(handleUserPromptSubmit({ prompt: "  " }), null);
});

test("stop wraps new assistant text (since a given line offset) in a CLAUDE callout", () => {
  const transcriptLines = [
    '{"type":"message","message":{"role":"assistant","content":[{"type":"text","text":"already logged"}]}}',
    '{"type":"message","message":{"role":"assistant","content":[{"type":"text","text":"new text"}]}}',
  ];
  const out = handleStop({ lines: transcriptLines, sinceLine: 1 });
  assert.match(out, /new text/);
  assert.ok(!out.includes("already logged"));
});

test("stop returns null when there is no new assistant text", () => {
  const transcriptLines = ['{"type":"message","message":{"role":"user","content":"hi"}}'];
  assert.equal(handleStop({ lines: transcriptLines, sinceLine: 0 }), null);
});

test("stop.mjs main() survives unparseable JSON on stdin without crashing", () => {
  assert.doesNotThrow(() => execFileSync(process.execPath, [STOP_SCRIPT], { input: "not json" }));
});

test("stop.mjs main() survives a payload missing transcript_path without crashing", () => {
  assert.doesNotThrow(() => execFileSync(process.execPath, [STOP_SCRIPT], { input: JSON.stringify({}) }));
});

test("user-prompt-submit.mjs main() survives unparseable JSON on stdin without crashing", () => {
  assert.doesNotThrow(() => execFileSync(process.execPath, [USER_PROMPT_SUBMIT_SCRIPT], { input: "not json" }));
});

test("user-prompt-submit.mjs main() survives a payload missing transcript_path without crashing", () => {
  assert.doesNotThrow(() =>
    execFileSync(process.execPath, [USER_PROMPT_SUBMIT_SCRIPT], { input: JSON.stringify({ prompt: "hi" }) }),
  );
});

test("ask-user-question.mjs main() survives unparseable JSON on stdin without crashing", () => {
  assert.doesNotThrow(() => execFileSync(process.execPath, [ASK_USER_QUESTION_SCRIPT], { input: "not json" }));
});

test("ask-user-question.mjs main() survives a payload missing transcript_path without crashing", () => {
  assert.doesNotThrow(() =>
    execFileSync(process.execPath, [ASK_USER_QUESTION_SCRIPT], {
      input: JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "AskUserQuestion" }),
    }),
  );
});
