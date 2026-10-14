import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveVaultPath, isDeclined, setDeclined, saveVaultPath, isSessionId, logVaultError } from "../hooks/vault/state.mjs";
import { isSlug } from "../hooks/vault/paths.mjs";
import { recordDigest } from "../hooks/vault/writer.mjs";
import { prerequisitesOf } from "../hooks/vault/graph.mjs";
import { readTopicLedger, slugify } from "./mastery.mjs";

const DIGEST_MAX_CHARS = 2000;
const KINDS = ["explained", "re-explained"];

export function parseArgs(argv) {
  const [command = "", ...tail] = argv;
  const flags = {};
  const rest = [];
  for (let i = 0; i < tail.length; i++) {
    if (tail[i].startsWith("--") && i + 1 < tail.length) flags[tail[i].slice(2)] = tail[++i];
    else rest.push(tail[i]);
  }
  return { command, flags, rest };
}

function samePath(a, b) {
  try {
    return realpathSync(a) === realpathSync(b);
  } catch {
    return false;
  }
}

// `claude plugin list --json` gives { id, installPath } per plugin; the id is what
// `claude plugin configure` wants, and the install path is how we know which one is us.
export function pluginIdFor(list, pluginRoot) {
  const found = (Array.isArray(list) ? list : []).find((entry) => entry && typeof entry.installPath === "string" && samePath(entry.installPath, pluginRoot));
  return found ? found.id : null;
}

function fail(message) {
  console.error(`vault.mjs: ${message}`);
  process.exit(1);
}

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function digest(flags) {
  const { node, kind } = flags;
  if (!flags.topic) fail("--topic is required");
  const topic = slugify(flags.topic); // the same slug the ledger and the record-check hook use
  if (!isSlug(node)) fail(`--node must be a lowercase-hyphenated slug, got ${JSON.stringify(node)}`);
  if (!KINDS.includes(kind)) fail(`--kind must be one of ${KINDS.join(", ")}`);
  const sessionId = flags.session || process.env.CLAUDE_CODE_SESSION_ID;
  if (!isSessionId(sessionId)) fail("no session id: pass --session or run inside Claude Code");
  const text = readStdin().trim();
  if (text === "") fail("the digest text on stdin is empty");
  if (!resolveVaultPath()) {
    console.log("no vault configured; nothing saved");
    return;
  }
  const plan = readTopicLedger(topic).session?.dependencyMap ?? null;
  const written = recordDigest({ topic, node, sessionId, requires: prerequisitesOf(plan, node), kind, digest: text.slice(0, DIGEST_MAX_CHARS) });
  console.log(written ? "saved" : "not saved; see vault-debug.log");
}

// A path that is not a folder is "no vault", as the writer treats it; `problem` lets the
// teach skill say why when it offers setup again.
function status() {
  const path = resolveVaultPath();
  const declined = isDeclined();
  if (path === null) return { configured: false, declined };
  if (!existsSync(path) || !statSync(path).isDirectory()) return { configured: false, declined, problem: `folder not found: ${path}` };
  return { configured: true, declined };
}

function setup(rest) {
  const folder = rest[0];
  if (!folder || !isAbsolute(folder)) fail("usage: vault.mjs setup <absolute path to the vault folder>");
  if (!existsSync(folder) || !statSync(folder).isDirectory()) fail(`not a folder: ${folder}`);
  const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  let id = null;
  try {
    id = pluginIdFor(JSON.parse(execFileSync("claude", ["plugin", "list", "--json"], { encoding: "utf8" })), pluginRoot);
  } catch (error) {
    logVaultError(`setup: could not list plugins: ${error.message}`);
  }
  if (!id) {
    console.log("could not find this plugin's id; ask the learner to run /plugin configure sensei and set the vault folder there");
    return;
  }
  try {
    execFileSync("claude", ["plugin", "configure", id, "--values-stdin"], { input: JSON.stringify({ vault_path: folder }), encoding: "utf8" });
  } catch (error) {
    logVaultError(`setup: configure failed: ${error.message}`);
    console.log("could not save the setting; ask the learner to run /plugin configure sensei and set the vault folder there");
    return;
  }
  saveVaultPath(folder);
  console.log(`saved ${folder}; notes start with the next check`);
}

function main() {
  const { command, flags, rest } = parseArgs(process.argv.slice(2));
  if (command === "digest") return digest(flags);
  if (command === "status") return console.log(JSON.stringify(status()));
  if (command === "decline") return setDeclined();
  if (command === "setup") return setup(rest);
  console.error("Usage: vault.mjs <digest|status|decline|setup> ...");
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
