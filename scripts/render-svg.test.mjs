import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, existsSync, mkdirSync, rmSync, copyFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";

const SCRIPT = new URL("./render-svg.sh", import.meta.url).pathname;
const FIXTURE = new URL("./fixtures/valid.svg", import.meta.url).pathname;
const INVALID_FIXTURE = new URL("./fixtures/invalid.svg", import.meta.url).pathname;
const FIXTURES_DIR = dirname(FIXTURE);

function hasCmd(cmd) {
  try {
    execFileSync("bash", ["-c", `command -v ${cmd}`]);
    return true;
  } catch {
    return false;
  }
}
const skipReason = hasCmd("rsvg-convert") || hasCmd("magick") ? false : "neither rsvg-convert nor magick installed";

function copyFixtureToTmp(fixturePath) {
  const dir = mkdtempSync(join(tmpdir(), "render-svg-src-"));
  const dest = join(dir, "src.svg");
  copyFileSync(fixturePath, dest);
  return dest;
}

test("render-svg.sh requires exactly two arguments", () => {
  assert.throws(() => execFileSync("bash", [SCRIPT, "only-one"]));
});

test("render-svg.sh renders a valid SVG to a PNG", { skip: skipReason }, () => {
  const src = copyFixtureToTmp(FIXTURE);
  const dir = mkdtempSync(join(tmpdir(), "render-svg-test-"));
  const out = join(dir, "out.png");
  const output = execFileSync("bash", [SCRIPT, src, out]).toString();
  assert.match(output, /Rendered:/);
  assert.ok(existsSync(out));
});

test("render-svg.sh fails cleanly when the source file doesn't exist", { skip: skipReason }, () => {
  const dir = mkdtempSync(join(tmpdir(), "render-svg-test-"));
  const out = join(dir, "out.png");
  assert.throws(() => execFileSync("bash", [SCRIPT, join(dir, "missing.svg"), out]));
});

test("render-svg.sh fails cleanly and leaves no output file when both tools reject the source", { skip: skipReason }, () => {
  const src = copyFixtureToTmp(INVALID_FIXTURE);
  const dir = mkdtempSync(join(tmpdir(), "render-svg-test-"));
  const out = join(dir, "out.png");
  assert.throws(
    () => execFileSync("bash", [SCRIPT, src, out], { stdio: "pipe" }),
    (err) => /SVG render FAILED/.test(err.stderr.toString())
  );
  assert.ok(!existsSync(out));
});

test("render-svg.sh refuses to read a source outside $TMPDIR", { skip: skipReason }, () => {
  const dir = mkdtempSync(join(tmpdir(), "render-svg-test-"));
  const out = join(dir, "out.png");
  assert.throws(
    () => execFileSync("bash", [SCRIPT, FIXTURE, out], { stdio: "pipe" }),
    (err) => /refusing to use the source path outside \$TMPDIR/.test(err.stderr.toString())
  );
  assert.ok(!existsSync(out));
});

test("render-svg.sh refuses to write outside $TMPDIR", { skip: skipReason }, () => {
  const src = copyFixtureToTmp(FIXTURE);
  const outsideDir = join(FIXTURES_DIR, "not-under-tmp-svg");
  mkdirSync(outsideDir, { recursive: true });
  const out = join(outsideDir, "out.png");
  try {
    assert.throws(
      () => execFileSync("bash", [SCRIPT, src, out], { stdio: "pipe" }),
      (err) => /refusing to use the output path outside \$TMPDIR/.test(err.stderr.toString())
    );
    assert.ok(!existsSync(out));
  } finally {
    rmSync(outsideDir, { recursive: true, force: true });
  }
});

test("render-svg.sh refuses to write through a symlink pointing outside $TMPDIR", { skip: skipReason }, () => {
  const src = copyFixtureToTmp(FIXTURE);
  const dir = mkdtempSync(join(tmpdir(), "render-svg-test-"));
  const out = join(dir, "sneaky.png");
  symlinkSync("/etc/hosts", out);
  try {
    assert.throws(
      () => execFileSync("bash", [SCRIPT, src, out], { stdio: "pipe" }),
      (err) => /refusing to use the output path outside \$TMPDIR/.test(err.stderr.toString())
    );
  } finally {
    rmSync(out, { force: true });
  }
});
