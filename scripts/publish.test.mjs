import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, symlinkSync } from "node:fs";
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

test("publish.sh refuses to publish a source file from outside $TMPDIR", () => {
  const dir = mkdtempSync(join(tmpdir(), "publish-test-"));
  const outsideSrc = new URL("./fixtures/valid.svg", import.meta.url).pathname;
  assert.throws(
    () => execFileSync("bash", [SCRIPT, outsideSrc, "slug"], { cwd: dir, stdio: "pipe" }),
    (err) => /refusing to use the source path outside \$TMPDIR/.test(err.stderr.toString())
  );
  assert.ok(!existsSync(join(dir, "viz")));
});

test("publish.sh refuses to publish through a symlink pointing outside $TMPDIR", () => {
  const dir = mkdtempSync(join(tmpdir(), "publish-test-"));
  const sneaky = join(dir, "sneaky.png");
  symlinkSync("/etc/hosts", sneaky);
  assert.throws(
    () => execFileSync("bash", [SCRIPT, sneaky, "slug"], { cwd: dir, stdio: "pipe" }),
    (err) => /refusing to use the source path outside \$TMPDIR/.test(err.stderr.toString())
  );
  assert.ok(!existsSync(join(dir, "viz")));
});

test("publish.sh refuses a symlink chain longer than the 20-hop bound", () => {
  const dir = mkdtempSync(join(tmpdir(), "publish-test-"));
  writeFileSync(join(dir, "final.png"), "end");
  let targetName = "final.png";
  for (let i = 24; i >= 0; i--) {
    symlinkSync(targetName, join(dir, `l${i}`));
    targetName = `l${i}`;
  }
  const src = join(dir, "l0");
  assert.throws(
    () => execFileSync("bash", [SCRIPT, src, "slug"], { cwd: dir, stdio: "pipe" }),
    (err) => /symlink chain exceeds 20 hops/.test(err.stderr.toString())
  );
  assert.ok(!existsSync(join(dir, "viz")));
});

test("publish.sh gives its own labeled error, not cd's generic one, when a symlink resolves into a missing directory", () => {
  const dir = mkdtempSync(join(tmpdir(), "publish-test-"));
  const src = join(dir, "broken-link.png");
  symlinkSync(join(dir, "missing-subdir", "file.png"), src);
  assert.throws(
    () => execFileSync("bash", [SCRIPT, src, "slug"], { cwd: dir, stdio: "pipe" }),
    (err) => /source directory does not exist after symlink resolution/.test(err.stderr.toString())
  );
  assert.ok(!existsSync(join(dir, "viz")));
});
