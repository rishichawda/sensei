import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = new URL("./render-svg.sh", import.meta.url).pathname;
const FIXTURE = new URL("./fixtures/valid.svg", import.meta.url).pathname;
const INVALID_FIXTURE = new URL("./fixtures/invalid.svg", import.meta.url).pathname;

function hasCmd(cmd) {
  try {
    execFileSync("bash", ["-c", `command -v ${cmd}`]);
    return true;
  } catch {
    return false;
  }
}
const skipReason = hasCmd("rsvg-convert") || hasCmd("magick") ? false : "neither rsvg-convert nor magick installed";

test("render-svg.sh requires exactly two arguments", () => {
  assert.throws(() => execFileSync("bash", [SCRIPT, "only-one"]));
});

test("render-svg.sh renders a valid SVG to a PNG", { skip: skipReason }, () => {
  const dir = mkdtempSync(join(tmpdir(), "render-svg-test-"));
  const out = join(dir, "out.png");
  const output = execFileSync("bash", [SCRIPT, FIXTURE, out]).toString();
  assert.match(output, /Rendered:/);
  assert.ok(existsSync(out));
});

test("render-svg.sh fails cleanly when the source file doesn't exist", { skip: skipReason }, () => {
  const dir = mkdtempSync(join(tmpdir(), "render-svg-test-"));
  const out = join(dir, "out.png");
  assert.throws(() => execFileSync("bash", [SCRIPT, join(dir, "missing.svg"), out]));
});

test("render-svg.sh fails cleanly and leaves no output file when both tools reject the source", { skip: skipReason }, () => {
  const dir = mkdtempSync(join(tmpdir(), "render-svg-test-"));
  const out = join(dir, "out.png");
  assert.throws(() => execFileSync("bash", [SCRIPT, INVALID_FIXTURE, out]));
  assert.ok(!existsSync(out));
});
