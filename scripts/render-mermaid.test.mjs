import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, existsSync, accessSync, constants, mkdirSync, rmSync } from "node:fs";
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

test("render-mermaid.sh requires exactly two arguments", () => {
  assert.throws(() => execFileSync("bash", [SCRIPT, "only-one"]));
});

test("render-mermaid.sh renders a valid diagram to a PNG", { skip: skipReason }, () => {
  const dir = mkdtempSync(join(tmpdir(), "render-mermaid-test-"));
  const out = join(dir, "out.png");
  const output = execFileSync("bash", [SCRIPT, join(FIXTURES, "valid.mmd"), out]).toString();
  assert.match(output, /Rendered:/);
  assert.ok(existsSync(out));
});

test("render-mermaid.sh fails cleanly on invalid syntax", { skip: skipReason }, () => {
  const dir = mkdtempSync(join(tmpdir(), "render-mermaid-test-"));
  const out = join(dir, "out.png");
  assert.throws(() => execFileSync("bash", [SCRIPT, join(FIXTURES, "invalid.mmd"), out]));
  assert.ok(!existsSync(out));
});

test("render-mermaid.sh refuses to write outside $TMPDIR", { skip: skipReason }, () => {
  const outsideDir = join(FIXTURES, "not-under-tmp-mermaid");
  mkdirSync(outsideDir, { recursive: true });
  const out = join(outsideDir, "out.png");
  try {
    assert.throws(
      () => execFileSync("bash", [SCRIPT, join(FIXTURES, "valid.mmd"), out], { stdio: "pipe" }),
      (err) => /refusing to write outside \$TMPDIR/.test(err.stderr.toString())
    );
    assert.ok(!existsSync(out));
  } finally {
    rmSync(outsideDir, { recursive: true, force: true });
  }
});
