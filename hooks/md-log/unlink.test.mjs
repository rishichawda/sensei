// sensei/hooks/md-log/unlink.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readState, writeState } from "./lib.mjs";

const SCRIPT = fileURLToPath(new URL("./unlink.mjs", import.meta.url));

test("unlink.mjs unlinks the session named by CLAUDE_CODE_SESSION_ID, not the newest transcript", () => {
  const configRoot = mkdtempSync(join(tmpdir(), "md-log-unlink-config-"));
  const projectDir = join(configRoot, "projects", "test-project");
  mkdirSync(projectDir, { recursive: true });
  const mine = join(projectDir, "session-mine.jsonl");
  const other = join(projectDir, "session-other.jsonl");
  writeFileSync(mine, "", "utf8");
  writeFileSync(other, "", "utf8");
  const later = new Date(Date.now() + 60_000);
  utimesSync(other, later, later);
  writeState(mine, { file: "/notes/mine.md", lastLine: 0 });
  writeState(other, { file: "/notes/other.md", lastLine: 0 });

  const output = execFileSync(process.execPath, [SCRIPT], {
    env: { ...process.env, CLAUDE_CONFIG_DIR: configRoot, CLAUDE_CODE_SESSION_ID: "session-mine" },
  }).toString();

  assert.match(output, /Unlinked: \/notes\/mine\.md/);
  assert.equal(readState(mine).file, null);
  assert.equal(readState(other).file, "/notes/other.md");
});
