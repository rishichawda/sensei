import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const readJson = (path) => JSON.parse(readFileSync(`${ROOT}${path}`, "utf8"));

// npm 11 and older print an array, npm 12 an object keyed by package name.
function packedFiles() {
  const out = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--json"], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
  const pack = Array.isArray(out) ? out[0] : Object.values(out)[0];
  return pack.files.map((file) => file.path);
}

test("package.json is a public, scoped package whose version and license match plugin.json", () => {
  const pkg = readJson("package.json");
  const plugin = readJson(".claude-plugin/plugin.json");
  assert.equal(pkg.private, undefined);
  assert.match(pkg.name, /^@rishichawda\//);
  assert.equal(pkg.publishConfig.access, "public");
  assert.equal(pkg.version, plugin.version);
  assert.equal(pkg.license, plugin.license);
  assert.equal(readJson("package-lock.json").version, plugin.version);
  assert.equal(readJson("package-lock.json").packages[""].version, plugin.version);
});

test("the npm package carries the plugin and leaves out tests, fixtures and generated files", () => {
  const files = packedFiles();
  for (const needed of [
    ".claude-plugin/plugin.json", ".claude-plugin/marketplace.json", "hooks/hooks.json", "hooks/mod/register.tsx",
    "skills/teach/SKILL.md", "skills/visualize/SKILL.md", "agents/researcher.md", "scripts/mastery.mjs",
    "scripts/render-svg.sh", "scripts/render-mermaid.sh", "scripts/lib/svg-to-png.mjs", "types/index.d.ts",
    "README.md", "LICENSE", "NOTICE", "CHANGELOG.md", "package.json",
  ]) {
    assert.ok(files.includes(needed), `missing from the package: ${needed}`);
  }
  const unwanted = files.filter((file) => /\.test\.|^scripts\/fixtures\/|^\.claude-plugin\/types\/|^scripts\/release\.|^docs\/|^dev-docs\/|^evals\/|^assets\//.test(file));
  assert.deepEqual(unwanted, []);
});
