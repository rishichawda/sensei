import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, existsSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveVaultPath, writeActive, activePath } from "./state.mjs";

const SCRIPT = fileURLToPath(new URL("./sync-state.mjs", import.meta.url));
const run = (env) => execFileSync("node", [SCRIPT], { input: "{}", env: { ...process.env, ...env } });

test("sync copies the vault option to the saved file and removes it when the option is cleared", () => {
  const env = { CLAUDE_CONFIG_DIR: mkdtempSync(join(tmpdir(), "ss-")) };
  run({ ...env, CLAUDE_PLUGIN_OPTION_VAULT_PATH: "/my/vault" });
  assert.equal(resolveVaultPath(env), "/my/vault");
  run({ ...env, CLAUDE_PLUGIN_OPTION_VAULT_PATH: "" });
  assert.equal(resolveVaultPath(env), null);
});

test("sync prunes active files older than seven days", () => {
  const env = { CLAUDE_CONFIG_DIR: mkdtempSync(join(tmpdir(), "ss-")) };
  writeActive("old", "dns", env);
  const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
  utimesSync(activePath("old", env), old, old);
  run(env);
  assert.equal(existsSync(activePath("old", env)), false);
});
