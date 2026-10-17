import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("./propose-plan.mjs", import.meta.url));
const PLAN = { nodes: ["a", "b"], edges: [["a", "b"]], labels: { a: "The first idea", b: "The second idea" } };

function run(args, input) {
  const config = mkdtempSync(join(tmpdir(), "propose-cli-"));
  const result = spawnSync("node", [SCRIPT, ...args], { input, env: { ...process.env, CLAUDE_CONFIG_DIR: config }, encoding: "utf8" });
  return { ...result, config };
}

const readSession = (config, topic) => JSON.parse(readFileSync(join(config, "sensei", "ledgers", `${topic}.json`), "utf8")).session;

test("stores the plan from stdin as proposed under the slugified topic", () => {
  const result = run(["Camera Lens"], JSON.stringify(PLAN));
  assert.equal(result.status, 0, result.stderr);
  const session = readSession(result.config, "camera-lens");
  assert.deepEqual(session.proposedPlan, PLAN);
  assert.equal(session.dependencyMap, null);
});

test("refuses a bad plan, a missing topic or empty input, and writes nothing", () => {
  for (const [args, input, message] of [
    [["dns"], JSON.stringify({ nodes: ["tcp_handshake"], edges: [] }), /lowercase-hyphenated/],
    [["dns"], JSON.stringify({ nodes: ["a"], edges: [["a", "ghost"]] }), /not in plan\.nodes/],
    [["dns"], JSON.stringify({ nodes: ["a"], edges: [] }), /plan\.labels must give every node a plain-words name/],
    [["dns"], "not json", /JSON/],
    [["dns"], "", /JSON/],
    [[], JSON.stringify(PLAN), /Usage/],
  ]) {
    const result = run(args, input);
    assert.equal(result.status, 1);
    assert.match(result.stderr, message);
  }
});
