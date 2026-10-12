import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { nextVersion, promoteUnreleased, releaseNotes } from "./release.mjs";

const SCRIPT = fileURLToPath(new URL("./release.mjs", import.meta.url));

const CHANGELOG = `# Changelog

Intro.

## [Unreleased]

- Added a thing.
- Fixed a thing.

## [0.1.0]

First version.
`;

test("nextVersion bumps patch, minor and major and resets lower parts", () => {
  assert.equal(nextVersion("1.2.3", "patch"), "1.2.4");
  assert.equal(nextVersion("1.2.3", "minor"), "1.3.0");
  assert.equal(nextVersion("1.2.3", "major"), "2.0.0");
});

test("nextVersion rejects an unknown level and a malformed version", () => {
  assert.throws(() => nextVersion("1.2.3", "huge"), /bump must be one of/);
  assert.throws(() => nextVersion("1.2", "patch"), /not MAJOR\.MINOR\.PATCH/);
  assert.throws(() => nextVersion("1.2.3-beta", "patch"), /not MAJOR\.MINOR\.PATCH/);
});

test("promoteUnreleased moves the body under the new version and leaves an empty Unreleased", () => {
  const out = promoteUnreleased(CHANGELOG, "0.2.0", "2026-10-12");
  assert.match(out, /## \[Unreleased\]\n\n## \[0\.2\.0\] - 2026-10-12\n\n- Added a thing\.\n- Fixed a thing\.\n\n## \[0\.1\.0\]\n\nFirst version\.\n$/);
  assert.ok(out.startsWith("# Changelog\n\nIntro.\n\n## [Unreleased]"));
});

test("promoteUnreleased refuses an empty Unreleased section", () => {
  const empty = CHANGELOG.replace("- Added a thing.\n- Fixed a thing.\n", "");
  assert.throws(() => promoteUnreleased(empty, "0.2.0", "2026-10-12"), /Unreleased section is empty/);
});

test("promoteUnreleased works when Unreleased is the last section", () => {
  const only = "# Changelog\n\n## [Unreleased]\n\n- One.\n";
  const out = promoteUnreleased(only, "0.1.0", "2026-10-12");
  assert.equal(out, "# Changelog\n\n## [Unreleased]\n\n## [0.1.0] - 2026-10-12\n\n- One.\n");
});

test("promoteUnreleased refuses a changelog with no Unreleased heading", () => {
  assert.throws(() => promoteUnreleased("# Changelog\n", "0.2.0", "2026-10-12"), /no "## \[Unreleased\]" heading/);
});

test("releaseNotes returns only the body of the requested version", () => {
  const out = promoteUnreleased(CHANGELOG, "0.2.0", "2026-10-12");
  assert.equal(releaseNotes(out, "0.2.0"), "- Added a thing.\n- Fixed a thing.");
  assert.equal(releaseNotes(out, "0.1.0"), "First version.");
  assert.throws(() => releaseNotes(out, "9.9.9"), /no section for 9\.9\.9/);
});

test("release.mjs bumps plugin.json, rewrites the changelog and writes the notes file", () => {
  const root = mkdtempSync(join(tmpdir(), "release-test-"));
  mkdirSync(join(root, ".claude-plugin"));
  const pluginText = '{\n  "name": "x",\n  "version": "0.1.0",\n  "keywords": ["a", "b"]\n}\n';
  writeFileSync(join(root, ".claude-plugin", "plugin.json"), pluginText);
  writeFileSync(join(root, "CHANGELOG.md"), CHANGELOG);
  const notes = join(root, "notes.md");
  const out = execFileSync("node", [SCRIPT, "minor", "--notes-file", notes], { cwd: root }).toString().trim();
  assert.equal(out, "0.2.0");
  assert.equal(
    readFileSync(join(root, ".claude-plugin", "plugin.json"), "utf8"),
    pluginText.replace("0.1.0", "0.2.0"),
  );
  assert.match(readFileSync(join(root, "CHANGELOG.md"), "utf8"), /## \[0\.2\.0\] - \d{4}-\d{2}-\d{2}/);
  assert.equal(readFileSync(notes, "utf8"), "- Added a thing.\n- Fixed a thing.\n");
});

test("release.mjs exits non-zero and leaves files untouched when Unreleased is empty", () => {
  const root = mkdtempSync(join(tmpdir(), "release-test-"));
  mkdirSync(join(root, ".claude-plugin"));
  const pluginText = '{ "version": "0.1.0" }\n';
  const changelog = "# Changelog\n\n## [Unreleased]\n\n## [0.1.0]\n\nx\n";
  writeFileSync(join(root, ".claude-plugin", "plugin.json"), pluginText);
  writeFileSync(join(root, "CHANGELOG.md"), changelog);
  assert.throws(() => execFileSync("node", [SCRIPT, "patch"], { cwd: root, stdio: "pipe" }), /Unreleased section is empty/);
  assert.equal(readFileSync(join(root, ".claude-plugin", "plugin.json"), "utf8"), pluginText);
  assert.equal(readFileSync(join(root, "CHANGELOG.md"), "utf8"), changelog);
});
