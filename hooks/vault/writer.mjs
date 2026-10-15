import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { vaultRoot, nodeFile, mapFile } from "./paths.mjs";
import { resolveVaultPath, logVaultError } from "./state.mjs";
import { newNoteText, lastSessionId, sessionHeader, checkText, digestText } from "./note.mjs";
import { mapNoteText } from "./map.mjs";

// The vault folder must already exist: sensei creates <vault>/sensei/... but never
// the vault itself, so a mistyped path cannot litter the disk.
function usableRoot(env) {
  const root = vaultRoot(resolveVaultPath(env));
  if (!root) return null;
  const vault = dirname(root);
  let isDirectory = false;
  try {
    isDirectory = statSync(vault).isDirectory();
  } catch {
    isDirectory = false;
  }
  if (!isDirectory) {
    logVaultError(`vault directory not found: ${vault}`, env);
    return null;
  }
  return root;
}

// Append-only: the file is read, never rewritten. Whatever `build` returns is
// added after what is already there.
function appendToNote({ env, topic, node, sessionId, now, requires, build }) {
  try {
    const root = usableRoot(env);
    if (!root) return false;
    const file = nodeFile(root, topic, node);
    const existing = existsSync(file) ? readFileSync(file, "utf8") : null;
    const base = existing ?? "";
    let out = "";
    // A learner may have typed at the end of the note in Obsidian: never join their last line.
    if (base !== "" && !base.endsWith("\n")) out += "\n";
    if (existing === null) out += newNoteText({ topic, node, requires });
    if (lastSessionId(base) !== sessionId) out += sessionHeader(sessionId, now);
    out += build(base);
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, out, "utf8");
    return true;
  } catch (error) {
    logVaultError(`write failed: ${error.message}`, env);
    return false;
  }
}

export function recordCheck({ env = process.env, topic, node, sessionId, now = new Date(), requires = [], question, answer, picked, result, options }) {
  return appendToNote({
    env, topic, node, sessionId, now, requires,
    build: (existing) => checkText({ existing, question, answer, picked, result, options }),
  });
}

export function recordDigest({ env = process.env, topic, node, sessionId, now = new Date(), requires = [], kind, digest }) {
  return appendToNote({ env, topic, node, sessionId, now, requires, build: () => digestText(kind, digest) });
}

export function writeMap({ env = process.env, topic, goal, plan }) {
  try {
    const root = usableRoot(env);
    if (!root) return false;
    const file = mapFile(root, topic);
    if (existsSync(file) && !readFileSync(file, "utf8").includes("sensei-owned: true")) {
      logVaultError(`not overwriting ${file}: it is not sensei-owned`, env);
      return false;
    }
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, mapNoteText({ topic, goal, plan }), "utf8");
    return true;
  } catch (error) {
    logVaultError(`map write failed: ${error.message}`, env);
    return false;
  }
}
