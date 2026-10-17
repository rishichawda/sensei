import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const LEVELS = ["patch", "minor", "major"];
const UNRELEASED = "## [Unreleased]";

export function nextVersion(current, level) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(current);
  if (!match) throw new Error(`version "${current}" is not MAJOR.MINOR.PATCH`);
  if (!LEVELS.includes(level)) throw new Error(`bump must be one of ${LEVELS.join(", ")}, got "${level}"`);
  const [major, minor, patch] = match.slice(1).map(Number);
  if (level === "major") return `${major + 1}.0.0`;
  if (level === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

// Splits the changelog around the Unreleased section: text before it, its body, text after it.
function splitUnreleased(changelog) {
  const start = changelog.indexOf(UNRELEASED);
  if (start === -1) throw new Error(`CHANGELOG.md has no "${UNRELEASED}" heading`);
  const bodyStart = start + UNRELEASED.length;
  const nextHeading = changelog.indexOf("\n## ", bodyStart);
  const bodyEnd = nextHeading === -1 ? changelog.length : nextHeading + 1;
  return {
    before: changelog.slice(0, start),
    body: changelog.slice(bodyStart, bodyEnd).trim(),
    after: changelog.slice(bodyEnd),
  };
}

export function promoteUnreleased(changelog, version, date) {
  const { before, body, after } = splitUnreleased(changelog);
  if (!body) throw new Error("Unreleased section is empty; write the changes there before releasing");
  const rest = after ? `\n${after}` : "";
  return `${before}${UNRELEASED}\n\n## [${version}] - ${date}\n\n${body}\n${rest}`;
}

export function releaseNotes(changelog, version) {
  const heading = new RegExp(`^## \\[${version.replaceAll(".", "\\.")}\\].*$`, "m");
  const found = heading.exec(changelog);
  if (!found) throw new Error(`CHANGELOG.md has no section for ${version}`);
  const from = found.index + found[0].length;
  const next = changelog.indexOf("\n## ", from);
  return changelog.slice(from, next === -1 ? changelog.length : next).trim();
}

const VERSION_FIELD = /("version":\s*")[^"]+(")/;

// The plugin manifest, package.json and package-lock.json carry the same version: the
// plugin is also published to npm, and the lockfile ships with that package.
export function release(root, level, date) {
  const pluginPath = join(root, ".claude-plugin", "plugin.json");
  const packagePath = join(root, "package.json");
  const lockPath = join(root, "package-lock.json");
  const changelogPath = join(root, "CHANGELOG.md");
  const pluginText = readFileSync(pluginPath, "utf8");
  const version = nextVersion(JSON.parse(pluginText).version, level);
  const changelog = promoteUnreleased(readFileSync(changelogPath, "utf8"), version, date);
  const packageText = readFileSync(packagePath, "utf8").replace(VERSION_FIELD, `$1${version}$2`);
  const lock = JSON.parse(readFileSync(lockPath, "utf8"));
  lock.version = version;
  lock.packages[""].version = version;
  writeFileSync(pluginPath, pluginText.replace(VERSION_FIELD, `$1${version}$2`));
  writeFileSync(packagePath, packageText);
  writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
  writeFileSync(changelogPath, changelog);
  return { version, notes: releaseNotes(changelog, version) };
}

function main() {
  const [level, ...rest] = process.argv.slice(2);
  const notesIndex = rest.indexOf("--notes-file");
  const notesFile = notesIndex === -1 ? null : rest[notesIndex + 1];
  try {
    const date = new Date().toISOString().slice(0, 10);
    const { version, notes } = release(process.cwd(), level, date);
    if (notesFile) writeFileSync(notesFile, `${notes}\n`);
    console.log(version);
  } catch (error) {
    console.error(`release.mjs: ${error.message}`);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
