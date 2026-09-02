import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = new URL("./publish.sh", import.meta.url).pathname;

test("publish.sh slugifies and copies into <cwd>/viz with a unique filename", () => {
  const dir = mkdtempSync(join(tmpdir(), "publish-test-"));
  const src = join(dir, "src.png");
  writeFileSync(src, "fake-png-bytes");

  const output = execFileSync("bash", [SCRIPT, src, "Internet Packets!!"], { cwd: dir }).toString();

  const filenameMatch = output.match(/filename: (viz-internet-packets-\d+\.png)/);
  assert.ok(filenameMatch, `unexpected output:\n${output}`);
  const dest = join(dir, "viz", filenameMatch[1]);
  assert.ok(existsSync(dest));
  assert.equal(readFileSync(dest, "utf8"), "fake-png-bytes");
});

test("publish.sh fails loudly when the source file doesn't exist", () => {
  const dir = mkdtempSync(join(tmpdir(), "publish-test-"));
  assert.throws(() => execFileSync("bash", [SCRIPT, join(dir, "missing.png"), "slug"], { cwd: dir }));
});

test("publish.sh falls back to 'viz' when the slug has no alphanumeric characters", () => {
  const dir = mkdtempSync(join(tmpdir(), "publish-test-"));
  const src = join(dir, "src.png");
  writeFileSync(src, "x");
  const output = execFileSync("bash", [SCRIPT, src, "!!!"], { cwd: dir }).toString();
  assert.match(output, /filename: viz-viz-\d+\.png/);
});

test("publish.sh requires exactly two arguments", () => {
  assert.throws(() => execFileSync("bash", [SCRIPT, "only-one-arg"]));
});
