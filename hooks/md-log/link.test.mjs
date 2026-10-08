// sensei/hooks/md-log/link.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readState } from "./lib.mjs";

const SCRIPT = fileURLToPath(new URL("./link.mjs", import.meta.url));

function setupProject() {
  const configRoot = mkdtempSync(join(tmpdir(), "md-log-link-config-"));
  const projectDirName = "test-project";
  const projectDir = join(configRoot, "projects", projectDirName);
  mkdirSync(projectDir, { recursive: true });
  return { configRoot, projectDirName, projectDir };
}

test("link.mjs backfills the transcript inline and initializes lastLine to the transcript's line count", () => {
  const { configRoot, projectDir } = setupProject();
  const transcriptPath = join(projectDir, "session-abc.jsonl");
  const transcriptLines = [
    '{"type":"message","message":{"role":"user","content":"What is TCP?"}}',
    '{"type":"message","message":{"role":"assistant","content":[{"type":"text","text":"TCP is a reliable transport protocol."}]}}',
  ];
  writeFileSync(transcriptPath, transcriptLines.join("\n") + "\n", "utf8");

  const targetDir = mkdtempSync(join(tmpdir(), "md-log-link-target-"));
  const targetFile = join(targetDir, "lesson.md");
  writeFileSync(targetFile, "", "utf8");

  const output = execFileSync(process.execPath, [SCRIPT, targetFile], {
    env: { ...process.env, CLAUDE_CONFIG_DIR: configRoot, CLAUDE_CODE_SESSION_ID: "session-abc" },
  }).toString();

  assert.match(output, /Linked:/);
  assert.match(output, /2 entries backfilled/);

  const content = readFileSync(targetFile, "utf8");
  assert.match(content, /What is TCP\?/);
  assert.match(content, /TCP is a reliable transport protocol\./);

  const state = readState(transcriptPath);
  assert.equal(state.file, targetFile);
  assert.equal(state.lastLine, 2);
});

test("link.mjs backfills nothing (0 entries) when the transcript has no messages yet", () => {
  const { configRoot, projectDir } = setupProject();
  const transcriptPath = join(projectDir, "session-empty.jsonl");
  // A brand-new session with no turns yet: the transcript file exists (it's
  // how findCurrentTranscript discovers it) but is empty of messages.
  writeFileSync(transcriptPath, "", "utf8");

  const targetDir = mkdtempSync(join(tmpdir(), "md-log-link-target-"));
  const targetFile = join(targetDir, "lesson.md");
  writeFileSync(targetFile, "", "utf8");

  const output = execFileSync(process.execPath, [SCRIPT, targetFile], {
    env: { ...process.env, CLAUDE_CONFIG_DIR: configRoot, CLAUDE_CODE_SESSION_ID: "session-empty" },
  }).toString();

  assert.match(output, /Linked:/);
  assert.match(output, /0 entries backfilled/);

  const state = readState(transcriptPath);
  assert.equal(state.file, targetFile);
  assert.equal(state.lastLine, 0, "an empty transcript must not push lastLine to 1 and swallow the next real turn");
});

test("link.mjs creates the target file when it doesn't exist yet", () => {
  const { configRoot, projectDir } = setupProject();
  const transcriptPath = join(projectDir, "session-new-target.jsonl");
  writeFileSync(transcriptPath, "", "utf8");

  const targetDir = mkdtempSync(join(tmpdir(), "md-log-link-target-"));
  const targetFile = join(targetDir, "does-not-exist-yet.md");

  const output = execFileSync(process.execPath, [SCRIPT, targetFile], {
    env: { ...process.env, CLAUDE_CONFIG_DIR: configRoot, CLAUDE_CODE_SESSION_ID: "session-new-target" },
  }).toString();

  assert.match(output, /Linked:/);
  assert.ok(existsSync(targetFile));

  const state = readState(transcriptPath);
  assert.equal(state.file, targetFile);
});

test("link.mjs reports a clean error when the target's parent directory doesn't exist", () => {
  const { configRoot, projectDir } = setupProject();
  const transcriptPath = join(projectDir, "session-missing-parent.jsonl");
  writeFileSync(transcriptPath, "", "utf8");

  const targetFile = join(mkdtempSync(join(tmpdir(), "md-log-link-target-")), "no-such-dir", "lesson.md");

  const output = execFileSync(process.execPath, [SCRIPT, targetFile], {
    env: { ...process.env, CLAUDE_CONFIG_DIR: configRoot, CLAUDE_CODE_SESSION_ID: "session-missing-parent" },
  }).toString();

  assert.match(output, /Could not create file/);
  assert.ok(!existsSync(targetFile));
});

test("link.mjs rejects a path that is a directory", () => {
  const { configRoot, projectDir } = setupProject();
  const transcriptPath = join(projectDir, "session-dir-target.jsonl");
  writeFileSync(transcriptPath, "", "utf8");

  const targetDir = join(mkdtempSync(join(tmpdir(), "md-log-link-target-")), "folder.md");
  mkdirSync(targetDir);

  const output = execFileSync(process.execPath, [SCRIPT, targetDir], {
    env: { ...process.env, CLAUDE_CONFIG_DIR: configRoot, CLAUDE_CODE_SESSION_ID: "session-dir-target" },
  }).toString();

  assert.match(output, /Not a file/);
});

test("linking against an empty transcript does not drop the first turn that lands afterward (stop.mjs top-up)", () => {
  const { configRoot, projectDir } = setupProject();
  const transcriptPath = join(projectDir, "session-live.jsonl");
  writeFileSync(transcriptPath, "", "utf8");

  const targetDir = mkdtempSync(join(tmpdir(), "md-log-link-target-"));
  const targetFile = join(targetDir, "lesson.md");
  writeFileSync(targetFile, "", "utf8");

  execFileSync(process.execPath, [SCRIPT, targetFile], {
    env: { ...process.env, CLAUDE_CONFIG_DIR: configRoot, CLAUDE_CODE_SESSION_ID: "session-live" },
  });

  // The session's first real turn lands after linking.
  const line = '{"type":"message","message":{"role":"assistant","content":[{"type":"text","text":"first turn after linking"}]}}';
  writeFileSync(transcriptPath, line + "\n", "utf8");

  const STOP_SCRIPT = fileURLToPath(new URL("./stop.mjs", import.meta.url));
  execFileSync(process.execPath, [STOP_SCRIPT], {
    input: JSON.stringify({ transcript_path: transcriptPath }),
  });

  const content = readFileSync(targetFile, "utf8");
  assert.match(content, /first turn after linking/);
});

test("link.mjs links the session named by CLAUDE_CODE_SESSION_ID even when another session's transcript is newer", () => {
  const { configRoot, projectDir } = setupProject();
  const mine = join(projectDir, "session-mine.jsonl");
  const other = join(projectDir, "session-other.jsonl");
  const msg = (text) => JSON.stringify({ type: "message", message: { role: "user", content: text } }) + "\n";
  writeFileSync(mine, msg("MINE-message"), "utf8");
  writeFileSync(other, msg("OTHER-session-secret"), "utf8");
  // Make the other session's transcript the most recently modified one.
  const later = new Date(Date.now() + 60_000);
  utimesSync(other, later, later);

  const targetFile = join(mkdtempSync(join(tmpdir(), "md-log-link-target-")), "lesson.md");
  const output = execFileSync(process.execPath, [SCRIPT, targetFile], {
    env: { ...process.env, CLAUDE_CONFIG_DIR: configRoot, CLAUDE_CODE_SESSION_ID: "session-mine" },
  }).toString();

  assert.match(output, /Linked:/);
  const content = readFileSync(targetFile, "utf8");
  assert.match(content, /MINE-message/);
  assert.doesNotMatch(content, /OTHER-session-secret/);
  assert.equal(readState(mine).file, targetFile);
  assert.equal(readState(other).file, null);
});

test("link.mjs fails closed when the session id is not set, instead of guessing the newest transcript", () => {
  const { configRoot, projectDir } = setupProject();
  writeFileSync(join(projectDir, "session-only.jsonl"), "", "utf8");
  const targetFile = join(mkdtempSync(join(tmpdir(), "md-log-link-target-")), "lesson.md");
  const env = { ...process.env, CLAUDE_CONFIG_DIR: configRoot, CLAUDE_CODE_PROJECT_DIR_NAME: "test-project" };
  delete env.CLAUDE_CODE_SESSION_ID;

  const output = execFileSync(process.execPath, [SCRIPT, targetFile], { env }).toString();

  assert.match(output, /Could not locate this session's transcript/);
  assert.equal(readState(join(projectDir, "session-only.jsonl")).file, null);
});

test("link.mjs rejects a session id that is not a plain identifier", () => {
  const { configRoot, projectDir } = setupProject();
  writeFileSync(join(projectDir, "session-x.jsonl"), "", "utf8");
  const targetFile = join(mkdtempSync(join(tmpdir(), "md-log-link-target-")), "lesson.md");

  const output = execFileSync(process.execPath, [SCRIPT, targetFile], {
    env: { ...process.env, CLAUDE_CONFIG_DIR: configRoot, CLAUDE_CODE_PROJECT_DIR_NAME: "test-project", CLAUDE_CODE_SESSION_ID: "../session-x" },
  }).toString();

  assert.match(output, /Could not locate this session's transcript/);
});

test("link.mjs refuses an existing non-markdown file and leaves it untouched", () => {
  const { configRoot, projectDir } = setupProject();
  writeFileSync(join(projectDir, "session-nonmd.jsonl"), '{"type":"message","message":{"role":"user","content":"hi"}}\n', "utf8");
  const targetFile = join(mkdtempSync(join(tmpdir(), "md-log-link-target-")), "rc.sh");
  writeFileSync(targetFile, "export FOO=1\n", "utf8");

  const output = execFileSync(process.execPath, [SCRIPT, targetFile], {
    env: { ...process.env, CLAUDE_CONFIG_DIR: configRoot, CLAUDE_CODE_SESSION_ID: "session-nonmd" },
  }).toString();

  assert.match(output, /Only \.md files can be linked/);
  assert.equal(readFileSync(targetFile, "utf8"), "export FOO=1\n");
  assert.equal(readState(join(projectDir, "session-nonmd.jsonl")).file, null);
});

test("link.mjs does not create a missing non-markdown file", () => {
  const { configRoot, projectDir } = setupProject();
  writeFileSync(join(projectDir, "session-nonmd2.jsonl"), "", "utf8");
  const targetFile = join(mkdtempSync(join(tmpdir(), "md-log-link-target-")), "new-file.txt");

  const output = execFileSync(process.execPath, [SCRIPT, targetFile], {
    env: { ...process.env, CLAUDE_CONFIG_DIR: configRoot, CLAUDE_CODE_SESSION_ID: "session-nonmd2" },
  }).toString();

  assert.match(output, /Only \.md files can be linked/);
  assert.ok(!existsSync(targetFile));
});

test("link.mjs accepts an upper-case .MD extension", () => {
  const { configRoot, projectDir } = setupProject();
  writeFileSync(join(projectDir, "session-upper.jsonl"), "", "utf8");
  const targetFile = join(mkdtempSync(join(tmpdir(), "md-log-link-target-")), "NOTE.MD");

  const output = execFileSync(process.execPath, [SCRIPT, targetFile], {
    env: { ...process.env, CLAUDE_CONFIG_DIR: configRoot, CLAUDE_CODE_SESSION_ID: "session-upper" },
  }).toString();

  assert.match(output, /Linked:/);
});
