import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  isSessionId, configRoot, activePath, debugLogPath, logVaultError, resolveVaultPath, saveVaultPath,
  syncVaultPath, isDeclined, setDeclined, writeActive, clearActive, pruneActive,
} from "./state.mjs";

const freshEnv = (extra = {}) => ({ CLAUDE_CONFIG_DIR: mkdtempSync(join(tmpdir(), "vault-state-")), ...extra });

test("isSessionId accepts uuid-like ids and rejects path tricks", () => {
  assert.equal(isSessionId("0cb75412-e65e-447f-8db7-bd6914b83238"), true);
  for (const bad of ["", "../x", "a/b", "a b", "x".repeat(101), null, 4]) assert.equal(isSessionId(bad), false, String(bad));
});

test("configRoot prefers CLAUDE_CONFIG_DIR, falls back to HOME/.claude, and throws with neither", () => {
  assert.equal(configRoot({ CLAUDE_CONFIG_DIR: "/c", HOME: "/h" }), "/c");
  assert.equal(configRoot({ HOME: "/h" }), "/h/.claude");
  assert.throws(() => configRoot({}), /cannot determine config directory/);
});

test("activePath refuses a session id that is not safe as a file name", () => {
  const env = freshEnv();
  assert.throws(() => activePath("../x", env), /invalid session id/);
});

test("logVaultError appends a JSON line and keeps only the last 200", () => {
  const env = freshEnv();
  for (let i = 0; i < 205; i++) logVaultError(`m${i}`, env);
  const lines = readFileSync(debugLogPath(env), "utf8").split("\n").filter(Boolean);
  assert.equal(lines.length, 200);
  assert.equal(JSON.parse(lines.at(-1)).message, "m204");
});

test("logVaultError never throws, even when the config directory cannot be determined", () => {
  assert.doesNotThrow(() => logVaultError("x", {}));
});

test("resolveVaultPath prefers the option, then the saved file, then null", () => {
  const env = freshEnv();
  assert.equal(resolveVaultPath(env), null);
  saveVaultPath("/saved", env);
  assert.equal(resolveVaultPath(env), "/saved");
  assert.equal(resolveVaultPath({ ...env, CLAUDE_PLUGIN_OPTION_VAULT_PATH: " /option " }), "/option");
  assert.equal(resolveVaultPath({ ...env, CLAUDE_PLUGIN_OPTION_VAULT_PATH: "" }), "/saved");
});

test("syncVaultPath copies the option to the file and removes the file when the option is unset", () => {
  const env = freshEnv();
  syncVaultPath({ ...env, CLAUDE_PLUGIN_OPTION_VAULT_PATH: "/v" });
  assert.equal(resolveVaultPath(env), "/v");
  syncVaultPath(env);
  assert.equal(resolveVaultPath(env), null);
});

test("decline flag round-trips", () => {
  const env = freshEnv();
  assert.equal(isDeclined(env), false);
  setDeclined(env);
  assert.equal(isDeclined(env), true);
});

test("writeActive and clearActive manage one file per session", () => {
  const env = freshEnv();
  writeActive("s1", "dns", env);
  assert.deepEqual(JSON.parse(readFileSync(activePath("s1", env), "utf8")), { topic: "dns" });
  clearActive("s1", env);
  assert.equal(existsSync(activePath("s1", env)), false);
  assert.doesNotThrow(() => clearActive("s1", env));
});

test("pruneActive removes active files older than seven days and keeps newer ones", () => {
  const env = freshEnv();
  writeActive("old", "dns", env);
  writeActive("new", "dns", env);
  const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
  utimesSync(activePath("old", env), old, old);
  pruneActive(env);
  assert.equal(existsSync(activePath("old", env)), false);
  assert.equal(existsSync(activePath("new", env)), true);
});

test("pruneActive does nothing when there is no active directory", () => {
  assert.doesNotThrow(() => pruneActive(freshEnv()));
  const env = freshEnv();
  mkdirSync(join(env.CLAUDE_CONFIG_DIR, "sensei"), { recursive: true });
  writeFileSync(join(env.CLAUDE_CONFIG_DIR, "sensei", "keep.txt"), "x");
  assert.doesNotThrow(() => pruneActive(env));
});
