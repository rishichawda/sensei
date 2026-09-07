// sensei/hooks/md-log/link.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
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
  const { configRoot, projectDirName, projectDir } = setupProject();
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
    env: { ...process.env, CLAUDE_CONFIG_DIR: configRoot, CLAUDE_CODE_PROJECT_DIR_NAME: projectDirName },
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
  const { configRoot, projectDirName, projectDir } = setupProject();
  const transcriptPath = join(projectDir, "session-empty.jsonl");
  // A brand-new session with no turns yet: the transcript file exists (it's
  // how findCurrentTranscript discovers it) but is empty of messages.
  writeFileSync(transcriptPath, "", "utf8");

  const targetDir = mkdtempSync(join(tmpdir(), "md-log-link-target-"));
  const targetFile = join(targetDir, "lesson.md");
  writeFileSync(targetFile, "", "utf8");

  const output = execFileSync(process.execPath, [SCRIPT, targetFile], {
    env: { ...process.env, CLAUDE_CONFIG_DIR: configRoot, CLAUDE_CODE_PROJECT_DIR_NAME: projectDirName },
  }).toString();

  assert.match(output, /Linked:/);
  assert.match(output, /0 entries backfilled/);

  const state = readState(transcriptPath);
  assert.equal(state.file, targetFile);
  assert.equal(state.lastLine, 0, "an empty transcript must not push lastLine to 1 and swallow the next real turn");
});

test("link.mjs creates the target file when it doesn't exist yet", () => {
  const { configRoot, projectDirName, projectDir } = setupProject();
  const transcriptPath = join(projectDir, "session-new-target.jsonl");
  writeFileSync(transcriptPath, "", "utf8");

  const targetDir = mkdtempSync(join(tmpdir(), "md-log-link-target-"));
  const targetFile = join(targetDir, "does-not-exist-yet.md");

  const output = execFileSync(process.execPath, [SCRIPT, targetFile], {
    env: { ...process.env, CLAUDE_CONFIG_DIR: configRoot, CLAUDE_CODE_PROJECT_DIR_NAME: projectDirName },
  }).toString();

  assert.match(output, /Linked:/);
  assert.ok(existsSync(targetFile));

  const state = readState(transcriptPath);
  assert.equal(state.file, targetFile);
});

test("link.mjs reports a clean error when the target's parent directory doesn't exist", () => {
  const { configRoot, projectDirName, projectDir } = setupProject();
  const transcriptPath = join(projectDir, "session-missing-parent.jsonl");
  writeFileSync(transcriptPath, "", "utf8");

  const targetFile = join(mkdtempSync(join(tmpdir(), "md-log-link-target-")), "no-such-dir", "lesson.md");

  const output = execFileSync(process.execPath, [SCRIPT, targetFile], {
    env: { ...process.env, CLAUDE_CONFIG_DIR: configRoot, CLAUDE_CODE_PROJECT_DIR_NAME: projectDirName },
  }).toString();

  assert.match(output, /Could not create file/);
  assert.ok(!existsSync(targetFile));
});

test("link.mjs rejects a path that is a directory", () => {
  const { configRoot, projectDirName, projectDir } = setupProject();
  const transcriptPath = join(projectDir, "session-dir-target.jsonl");
  writeFileSync(transcriptPath, "", "utf8");

  const targetDir = mkdtempSync(join(tmpdir(), "md-log-link-target-"));

  const output = execFileSync(process.execPath, [SCRIPT, targetDir], {
    env: { ...process.env, CLAUDE_CONFIG_DIR: configRoot, CLAUDE_CODE_PROJECT_DIR_NAME: projectDirName },
  }).toString();

  assert.match(output, /Not a file/);
});

test("linking against an empty transcript does not drop the first turn that lands afterward (stop.mjs top-up)", () => {
  const { configRoot, projectDirName, projectDir } = setupProject();
  const transcriptPath = join(projectDir, "session-live.jsonl");
  writeFileSync(transcriptPath, "", "utf8");

  const targetDir = mkdtempSync(join(tmpdir(), "md-log-link-target-"));
  const targetFile = join(targetDir, "lesson.md");
  writeFileSync(targetFile, "", "utf8");

  execFileSync(process.execPath, [SCRIPT, targetFile], {
    env: { ...process.env, CLAUDE_CONFIG_DIR: configRoot, CLAUDE_CODE_PROJECT_DIR_NAME: projectDirName },
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
