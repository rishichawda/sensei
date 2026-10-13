import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const DEBUG_LOG_MAX_LINES = 200;
const ACTIVE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_ID = /^[A-Za-z0-9_-]{1,100}$/;

export function isSessionId(value) {
  return typeof value === "string" && SESSION_ID.test(value);
}

export function configRoot(env = process.env) {
  if (env.CLAUDE_CONFIG_DIR) return env.CLAUDE_CONFIG_DIR;
  if (env.HOME) return resolve(env.HOME, ".claude");
  throw new Error("vault: cannot determine config directory — set CLAUDE_CONFIG_DIR or HOME");
}

const senseiDir = (env) => resolve(configRoot(env), "sensei");

export const debugLogPath = (env = process.env) => resolve(senseiDir(env), "vault-debug.log");
export const vaultPathFile = (env = process.env) => resolve(senseiDir(env), "vault-path");
export const declinedPath = (env = process.env) => resolve(senseiDir(env), "vault-declined");

export function activePath(sessionId, env = process.env) {
  if (!isSessionId(sessionId)) throw new Error(`vault: invalid session id ${JSON.stringify(sessionId)}`);
  return resolve(senseiDir(env), "active", `${sessionId}.json`);
}

// Logging is best effort: a vault problem must never fail a hook.
export function logVaultError(message, env = process.env) {
  try {
    const path = debugLogPath(env);
    mkdirSync(dirname(path), { recursive: true });
    const existing = existsSync(path) ? readFileSync(path, "utf8").split("\n").filter(Boolean) : [];
    const line = JSON.stringify({ timestamp: new Date().toISOString(), message });
    writeFileSync(path, [...existing, line].slice(-DEBUG_LOG_MAX_LINES).join("\n") + "\n", "utf8");
  } catch {
    // nothing to do
  }
}

function optionValue(env) {
  const raw = env.CLAUDE_PLUGIN_OPTION_VAULT_PATH;
  return typeof raw === "string" && raw.trim() !== "" ? raw.trim() : null;
}

// Hooks get the plugin option as an environment variable; scripts the model runs
// through Bash do not. SessionStart (syncVaultPath) copies the option to a file
// and every reader goes through here.
export function resolveVaultPath(env = process.env) {
  const fromOption = optionValue(env);
  if (fromOption) return fromOption;
  try {
    const saved = readFileSync(vaultPathFile(env), "utf8").trim();
    return saved === "" ? null : saved;
  } catch {
    return null;
  }
}

export function saveVaultPath(path, env = process.env) {
  mkdirSync(dirname(vaultPathFile(env)), { recursive: true });
  writeFileSync(vaultPathFile(env), `${path}\n`, "utf8");
}

export function syncVaultPath(env = process.env) {
  const fromOption = optionValue(env);
  if (fromOption) saveVaultPath(fromOption, env);
  else rmSync(vaultPathFile(env), { force: true });
}

export function isDeclined(env = process.env) {
  return existsSync(declinedPath(env));
}

export function setDeclined(env = process.env) {
  mkdirSync(dirname(declinedPath(env)), { recursive: true });
  writeFileSync(declinedPath(env), "declined\n", "utf8");
}

export function writeActive(sessionId, topic, env = process.env) {
  const path = activePath(sessionId, env);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ topic }), "utf8");
}

export function clearActive(sessionId, env = process.env) {
  rmSync(activePath(sessionId, env), { force: true });
}

export function pruneActive(env = process.env, nowMs = Date.now()) {
  const dir = dirname(activePath("x", env));
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const path = resolve(dir, name);
    if (nowMs - statSync(path).mtimeMs > ACTIVE_MAX_AGE_MS) rmSync(path, { force: true });
  }
}
