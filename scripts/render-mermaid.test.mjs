import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, existsSync, accessSync, constants, mkdirSync, rmSync, copyFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("./render-mermaid.sh", import.meta.url));
const FIXTURES = fileURLToPath(new URL("./fixtures/", import.meta.url));
const MMDC = join(dirname(SCRIPT), "..", "node_modules", ".bin", "mmdc");

function mmdcAvailable() {
  try {
    accessSync(MMDC, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
const skipReason = mmdcAvailable() ? false : "mmdc not installed (run npm install in sensei/)";

function copyFixtureToTmp(fixtureName) {
  const dir = mkdtempSync(join(tmpdir(), "render-mermaid-src-"));
  const dest = join(dir, fixtureName);
  copyFileSync(join(FIXTURES, fixtureName), dest);
  return dest;
}

test("render-mermaid.sh requires exactly two arguments", () => {
  assert.throws(() => execFileSync("bash", [SCRIPT, "only-one"]));
});

test("render-mermaid.sh renders a valid diagram to a PNG", { skip: skipReason }, () => {
  const src = copyFixtureToTmp("valid.mmd");
  const dir = mkdtempSync(join(tmpdir(), "render-mermaid-test-"));
  const out = join(dir, "out.png");
  const output = execFileSync("bash", [SCRIPT, src, out]).toString();
  assert.match(output, /Rendered:/);
  assert.ok(existsSync(out));
});

test("render-mermaid.sh fails cleanly on invalid syntax", { skip: skipReason }, () => {
  const src = copyFixtureToTmp("invalid.mmd");
  const dir = mkdtempSync(join(tmpdir(), "render-mermaid-test-"));
  const out = join(dir, "out.png");
  assert.throws(
    () => execFileSync("bash", [SCRIPT, src, out], { stdio: "pipe" }),
    (err) => /Mermaid render FAILED/.test(err.stderr.toString())
  );
  assert.ok(!existsSync(out));
});

test("render-mermaid.sh refuses to read a source outside $TMPDIR", () => {
  const dir = mkdtempSync(join(tmpdir(), "render-mermaid-test-"));
  const out = join(dir, "out.png");
  assert.throws(
    () => execFileSync("bash", [SCRIPT, join(FIXTURES, "valid.mmd"), out], { stdio: "pipe" }),
    (err) => /refusing to use the source path outside \$TMPDIR/.test(err.stderr.toString())
  );
  assert.ok(!existsSync(out));
});

test("render-mermaid.sh refuses to write outside $TMPDIR", () => {
  const src = copyFixtureToTmp("valid.mmd");
  const outsideDir = join(FIXTURES, "not-under-tmp-mermaid");
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

test("render-mermaid.sh refuses to write through a symlink pointing outside $TMPDIR", () => {
  const src = copyFixtureToTmp("valid.mmd");
  const dir = mkdtempSync(join(tmpdir(), "render-mermaid-test-"));
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

test("render-mermaid.sh refuses a symlink chain longer than the 20-hop bound", () => {
  const src = copyFixtureToTmp("valid.mmd");
  const dir = mkdtempSync(join(tmpdir(), "render-mermaid-test-"));
  writeFileSync(join(dir, "final.txt"), "end");
  let targetName = "final.txt";
  for (let i = 24; i >= 0; i--) {
    symlinkSync(targetName, join(dir, `l${i}`));
    targetName = `l${i}`;
  }
  const out = join(dir, "l0");
  assert.throws(
    () => execFileSync("bash", [SCRIPT, src, out], { stdio: "pipe" }),
    (err) => /symlink chain exceeds 20 hops/.test(err.stderr.toString())
  );
});

test("render-mermaid.sh gives its own labeled error, not cd's generic one, when a symlink resolves into a missing directory", () => {
  const src = copyFixtureToTmp("valid.mmd");
  const dir = mkdtempSync(join(tmpdir(), "render-mermaid-test-"));
  const out = join(dir, "broken-link.png");
  symlinkSync(join(dir, "missing-subdir", "file.png"), out);
  assert.throws(
    () => execFileSync("bash", [SCRIPT, src, out], { stdio: "pipe" }),
    (err) => /output directory does not exist after symlink resolution/.test(err.stderr.toString())
  );
});
