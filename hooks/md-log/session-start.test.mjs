import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { backfill } from "./session-start.mjs";
import { readState, writeState } from "./lib.mjs";

test("backfill writes a user/assistant block per transcript message, in order", () => {
  const fixture = readFileSync(new URL("./fixtures/sample-transcript.jsonl", import.meta.url), "utf8");
  const lines = fixture.trim().split("\n");
  const dir = mkdtempSync(join(tmpdir(), "md-log-backfill-"));
  const logFile = join(dir, "lesson.md");

  const count = backfill(lines, logFile);

  assert.equal(count, 4);
  const content = readFileSync(logFile, "utf8");
  const youIdx = content.indexOf("What is TCP?");
  const piIdx = content.indexOf("TCP is a reliable transport protocol.");
  const you2Idx = content.indexOf("Why reliable?");
  const pi2Idx = content.indexOf("Because it retransmits lost packets.");
  assert.ok(youIdx < piIdx && piIdx < you2Idx && you2Idx < pi2Idx, "blocks must appear in transcript order");
});

test("backfill reconstructs Question/Answer callouts for an AskUserQuestion pair, in order with surrounding text", () => {
  const dir = mkdtempSync(join(tmpdir(), "md-log-backfill-"));
  const logFile = join(dir, "lesson.md");

  const assistantLine = JSON.stringify({
    type: "assistant",
    message: {
      role: "assistant",
      content: [
        { type: "text", text: "Let me ask you something first." },
        {
          type: "tool_use",
          name: "AskUserQuestion",
          input: { questions: [{ question: "Pick a number", header: "Number", options: [{ label: "1" }, { label: "2" }] }] },
        },
      ],
    },
  });
  const userLine = JSON.stringify({
    type: "user",
    message: { role: "user", content: [{ type: "tool_result", content: "ignored display string", tool_use_id: "toolu_1" }] },
    toolUseResult: { questions: [{ question: "Pick a number" }], answers: { "Pick a number": "42" }, annotations: {} },
  });

  const count = backfill([assistantLine, userLine], logFile);

  assert.equal(count, 3);
  const content = readFileSync(logFile, "utf8");
  const introIdx = content.indexOf("Let me ask you something first.");
  const questionIdx = content.indexOf("Pick a number");
  const answerIdx = content.indexOf("42");
  assert.ok(introIdx < questionIdx && questionIdx < answerIdx, "intro text, question, then answer must appear in order");
  assert.match(content, /\[!question\]/);
  assert.match(content, /\[!example\] Answer/);
});

test("backfill skips malformed lines instead of throwing", () => {
  const dir = mkdtempSync(join(tmpdir(), "md-log-backfill-"));
  const logFile = join(dir, "lesson.md");
  const count = backfill(["not json", '{"type":"message","message":{"role":"user","content":"ok"}}'], logFile);
  assert.equal(count, 1);
});

const SCRIPT = fileURLToPath(new URL("./session-start.mjs", import.meta.url));

test("main() only tops up lines since state.lastLine, and advances lastLine to the transcript's new length", () => {
  const dir = mkdtempSync(join(tmpdir(), "md-log-session-start-"));
  const transcriptPath = join(dir, "session.jsonl");
  const logFile = join(dir, "lesson.md");
  writeFileSync(logFile, "", "utf8");

  const line1 = '{"type":"message","message":{"role":"user","content":"What is TCP?"}}';
  const line2 = '{"type":"message","message":{"role":"assistant","content":[{"type":"text","text":"TCP is a reliable transport protocol."}]}}';
  // Transcript already has 2 lines backfilled previously (state.lastLine = 2).
  writeFileSync(transcriptPath, [line1, line2].join("\n") + "\n", "utf8");
  writeState(transcriptPath, { file: logFile, lastLine: 2 });

  // A new turn is appended to the transcript after the previous backfill.
  const line3 = '{"type":"message","message":{"role":"user","content":"Why reliable?"}}';
  const line4 = '{"type":"message","message":{"role":"assistant","content":[{"type":"text","text":"Because it retransmits lost packets."}]}}';
  writeFileSync(transcriptPath, [line1, line2, line3, line4].join("\n") + "\n", "utf8");

  execFileSync(process.execPath, [SCRIPT], {
    input: JSON.stringify({ transcript_path: transcriptPath }),
  });

  const content = readFileSync(logFile, "utf8");
  assert.ok(!content.includes("What is TCP?"), "already-backfilled line must not be re-logged");
  assert.match(content, /Why reliable\?/);
  assert.match(content, /Because it retransmits lost packets\./);

  const state = readState(transcriptPath);
  assert.equal(state.lastLine, 4);
});

test("main() does not advance lastLine past 0 for an empty transcript (would otherwise drop the first real turn)", () => {
  const dir = mkdtempSync(join(tmpdir(), "md-log-session-start-"));
  const transcriptPath = join(dir, "session.jsonl");
  const logFile = join(dir, "lesson.md");
  writeFileSync(logFile, "", "utf8");
  writeFileSync(transcriptPath, "", "utf8");
  writeState(transcriptPath, { file: logFile, lastLine: 0 });

  execFileSync(process.execPath, [SCRIPT], {
    input: JSON.stringify({ transcript_path: transcriptPath }),
  });

  const state = readState(transcriptPath);
  assert.equal(state.lastLine, 0);
});

test("main() exits cleanly on a literal JSON null payload instead of throwing", () => {
  assert.doesNotThrow(() => {
    execFileSync(process.execPath, [SCRIPT], { input: "null" });
  });
});
