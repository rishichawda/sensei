import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { handleUserPromptSubmit } from "./user-prompt-submit.mjs";
import { handleStop } from "./stop.mjs";
import { backfill } from "./session-start.mjs";
import { readState, writeState } from "./lib.mjs";

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

test("a crash between the live AskUserQuestion hooks and the turn's Stop event does not duplicate the Q&A on the next top-up", () => {
  const configRoot = mkdtempSync(join(tmpdir(), "md-log-dup-config-"));
  const projectDirName = "test-project";
  const projectDir = join(configRoot, "projects", projectDirName);
  mkdirSync(projectDir, { recursive: true });
  const transcriptPath = join(projectDir, "session.jsonl");
  const env = { ...process.env, CLAUDE_CONFIG_DIR: configRoot, CLAUDE_CODE_PROJECT_DIR_NAME: projectDirName };

  const logFile = join(mkdtempSync(join(tmpdir(), "md-log-dup-log-")), "lesson.md");
  writeFileSync(logFile, "", "utf8");

  const questionInput = { questions: [{ question: "Pick a number", header: "Number", options: [{ label: "1" }, { label: "2" }] }] };
  const toolUseResult = { questions: [{ question: "Pick a number" }], answers: { "Pick a number": "42" }, annotations: {} };

  writeFileSync(
    transcriptPath,
    JSON.stringify({ type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", name: "AskUserQuestion", input: questionInput }] } }) + "\n",
    "utf8",
  );
  writeState(transcriptPath, { file: logFile, lastLine: 0 });

  execFileSync(process.execPath, [ASK_USER_QUESTION_SCRIPT], {
    input: JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "AskUserQuestion", tool_input: questionInput, transcript_path: transcriptPath }),
    env,
  });

  appendFileSync(
    transcriptPath,
    JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "tool_result", content: "x", tool_use_id: "t1" }] }, toolUseResult }) + "\n",
    "utf8",
  );

  execFileSync(process.execPath, [ASK_USER_QUESTION_SCRIPT], {
    input: JSON.stringify({ hook_event_name: "PostToolUse", tool_name: "AskUserQuestion", tool_response: toolUseResult, transcript_path: transcriptPath }),
    env,
  });

  // Simulate a crash: the turn's Stop event never fires. The next
  // SessionStart top-up runs backfill() from whatever lastLine the live
  // hooks left behind.
  const state = readState(transcriptPath);
  const lines = readFileSync(transcriptPath, "utf8").trim().split("\n");
  const count = backfill(lines.slice(state.lastLine ?? 0), logFile);

  assert.equal(count, 0, "the live hooks must have already advanced lastLine past both entries");
  const content = readFileSync(logFile, "utf8");
  assert.equal((content.match(/\[!question\]/g) || []).length, 1);
  assert.equal((content.match(/\[!example\] Answer/g) || []).length, 1);
});
