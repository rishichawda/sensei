import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const LIB_DIR = dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIR = dirname(LIB_DIR);
const SCRIPTS = ["render-mermaid.sh", "render-svg.sh", "publish.sh"];

test("all three scripts source scripts/lib/confine.sh instead of carrying their own copy", () => {
  const notSourcing = execFileSync(
    "grep",
    ["-L", "source.*lib/confine.sh", ...SCRIPTS],
    { cwd: SCRIPTS_DIR }
  ).toString().trim();
  assert.equal(notSourcing, "", `scripts missing the source line: ${notSourcing}`);
});

test("none of the three scripts still define their own resolve_confined()", () => {
  for (const script of SCRIPTS) {
    // `grep -c` exits 1 when the count is 0, so run it through a shell that
    // always exits 0 and reports the count on stdout.
    const count = execFileSync(
      "bash",
      ["-c", `grep -c '^resolve_confined()' "$1" || true`, "--", join(SCRIPTS_DIR, script)]
    ).toString().trim();
    assert.equal(count, "0", `${script} still defines its own resolve_confined()`);
  }
});
