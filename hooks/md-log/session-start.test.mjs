import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { backfill } from "./session-start.mjs";
import { readState, writeState, userBlock, assistantBlock } from "./lib.mjs";

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

test("backfill skips injected skill-body lines (isMeta: true) and mirrors the surrounding command and reply", () => {
  const dir = mkdtempSync(join(tmpdir(), "md-log-backfill-"));
  const logFile = join(dir, "lesson.md");

  const commandLine = JSON.stringify({
    type: "user",
    message: { role: "user", content: "Use the teach skill to analyze this" },
  });
  const skillBodyLine = JSON.stringify({
    type: "user",
    isMeta: true,
    message: { role: "user", content: "This is the full skill body and should not appear in the output" },
  });
  const replyLine = JSON.stringify({
    type: "assistant",
    attributionSkill: "teach",
    message: {
      role: "assistant",
      content: "I analyzed it and here is the result.",
    },
  });

  const count = backfill([commandLine, skillBodyLine, replyLine], logFile);

  assert.equal(count, 2, "should only log command and reply, not the injected skill body");
  const content = readFileSync(logFile, "utf8");
  assert.match(content, /Use the teach skill to analyze this/, "command text must appear");
  assert.match(content, /I analyzed it and here is the result\./, "assistant reply must appear");
  assert.doesNotMatch(
    content,
    /This is the full skill body/,
    "injected skill body must not appear in output"
  );
});

test("backfill walks the live parentUuid chain and excludes an abandoned branch's turns", () => {
  const dir = mkdtempSync(join(tmpdir(), "md-log-backfill-"));
  const logFile = join(dir, "lesson.md");

  // Reproduces the probe's 9a95b2a7 shape: a shared ancestor uuid, two
  // sibling lines whose parentUuid both point at it (a double-submit or
  // /rewind fork), and only one of the two with a further descendant chain
  // reaching the transcript's actual final line. The shared ancestor is a
  // bookkeeping "system" line (not a real user/assistant turn) with no
  // `message` field at all, matching 9a95b2a7's actual shared parent
  // (53fbb713..., type:"system") — this is what a real fork's immediate
  // parent looks like, and it's what a map scoped to real-entries-only would
  // fail to resolve through.
  const rootLine = JSON.stringify({
    type: "user",
    uuid: "root-1",
    message: { role: "user", content: "Kick off the task" },
  });
  const bookkeepingLine = JSON.stringify({
    type: "system",
    uuid: "sys-1",
    parentUuid: "root-1",
  });
  const abandonedLine = JSON.stringify({
    type: "user",
    uuid: "abandoned-1",
    parentUuid: "sys-1",
    message: { role: "user", content: "Abandoned duplicate question" },
  });
  const liveQuestionLine = JSON.stringify({
    type: "user",
    uuid: "live-1",
    parentUuid: "sys-1",
    message: { role: "user", content: "Live question after double-submit" },
  });
  const liveAnswerLine = JSON.stringify({
    type: "assistant",
    uuid: "live-2",
    parentUuid: "live-1",
    message: { role: "assistant", content: "Live answer" },
  });

  const count = backfill(
    [rootLine, bookkeepingLine, abandonedLine, liveQuestionLine, liveAnswerLine],
    logFile
  );

  assert.equal(count, 3, "only the root turn plus the live branch's two turns should be logged");
  const content = readFileSync(logFile, "utf8");
  assert.doesNotMatch(
    content,
    /Abandoned duplicate question/,
    "the abandoned branch's turn must not appear in the output log"
  );
  const rootIdx = content.indexOf("Kick off the task");
  const liveQIdx = content.indexOf("Live question after double-submit");
  const liveAIdx = content.indexOf("Live answer");
  assert.ok(rootIdx >= 0 && liveQIdx >= 0 && liveAIdx >= 0, "all live-branch turns must appear");
  assert.ok(rootIdx < liveQIdx && liveQIdx < liveAIdx, "live-branch turns must appear in root-to-leaf order");
});

test("backfill recovers from a literal JSON null transcript line on the fallback (no-parentUuid) path and still logs the surrounding real turns", () => {
  const dir = mkdtempSync(join(tmpdir(), "md-log-backfill-"));
  const logFile = join(dir, "lesson.md");

  const userLine = JSON.stringify({
    type: "user",
    message: { role: "user", content: "What is TCP?" },
  });
  const nullLine = "null";
  const assistantLine = JSON.stringify({
    type: "assistant",
    message: {
      role: "assistant",
      content: [{ type: "text", text: "TCP is a reliable transport protocol." }],
    },
  });

  let count;
  assert.doesNotThrow(() => {
    count = backfill([userLine, nullLine, assistantLine], logFile);
  });

  assert.equal(count, 2, "the literal null line must be skipped, not crash or drop a real turn");
  const content = readFileSync(logFile, "utf8");
  const qIdx = content.indexOf("What is TCP?");
  const aIdx = content.indexOf("TCP is a reliable transport protocol.");
  assert.ok(qIdx >= 0 && aIdx >= 0, "both surrounding real turns must be logged");
  assert.ok(qIdx < aIdx, "surrounding turns must remain in order around the null line");
});

test("backfill recovers from a literal JSON null transcript line on the reconstruction (parentUuid-present) path", () => {
  const dir = mkdtempSync(join(tmpdir(), "md-log-backfill-"));
  const logFile = join(dir, "lesson.md");

  // hasParentUuid is true here (childLine carries parentUuid), so this
  // enters reconstructLivePath's uuid-map build before backfill's main loop
  // ever runs -- that's Finding 2's exact site. Once fixed, control flow
  // continues into backfill's main loop for the two real entries the walk
  // collects, which is Finding 1's site -- so this test exercises both
  // guards on the same path, even though the null line itself never reaches
  // Finding 1's line (it's never "real", so it's never collected).
  const rootLine = JSON.stringify({
    type: "user",
    uuid: "root-1",
    message: { role: "user", content: "Kick off the task" },
  });
  const nullLine = "null";
  const childLine = JSON.stringify({
    type: "assistant",
    uuid: "child-1",
    parentUuid: "root-1",
    message: { role: "assistant", content: "Acknowledged" },
  });

  let count;
  assert.doesNotThrow(() => {
    count = backfill([rootLine, nullLine, childLine], logFile);
  });

  assert.equal(count, 2, "the null line must not break uuid-map construction or the parentUuid walk");
  const content = readFileSync(logFile, "utf8");
  const rootIdx = content.indexOf("Kick off the task");
  const childIdx = content.indexOf("Acknowledged");
  assert.ok(rootIdx >= 0 && childIdx >= 0, "both real turns on the live chain must be logged");
  assert.ok(rootIdx < childIdx, "turns must appear in root-to-leaf order");
});

test("backfill falls back to plain file-order iteration when no real entry carries a parentUuid (backward compatibility)", () => {
  // fixtures/sample-transcript.jsonl carries no uuid/parentUuid fields at
  // all, matching every pre-existing transcript shape this hook has ever
  // seen. This proves Step 3's reconstruction degrades safely rather than
  // only being exercised on the branching case above: the output must be
  // byte-identical to today's plain file-order behavior, not just "in order".
  const fixture = readFileSync(new URL("./fixtures/sample-transcript.jsonl", import.meta.url), "utf8");
  const lines = fixture.trim().split("\n");
  const dir = mkdtempSync(join(tmpdir(), "md-log-backfill-"));
  const logFile = join(dir, "lesson.md");

  const count = backfill(lines, logFile);

  assert.equal(count, 4);
  const expected =
    [
      userBlock("What is TCP?"),
      assistantBlock("TCP is a reliable transport protocol."),
      userBlock("Why reliable?"),
      assistantBlock("Because it retransmits lost packets."),
    ].join("\n\n\n") + "\n";
  const content = readFileSync(logFile, "utf8");
  assert.equal(content, expected, "output must be byte-identical to plain file-order iteration");
});
