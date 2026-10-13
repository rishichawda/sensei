import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { pluginIdFor, parseArgs } from "./vault.mjs";
import { saveVaultPath } from "../hooks/vault/state.mjs";

const SCRIPT = fileURLToPath(new URL("./vault.mjs", import.meta.url));

function setup() {
  const config = mkdtempSync(join(tmpdir(), "vcli-config-"));
  const vault = mkdtempSync(join(tmpdir(), "vcli-vault-"));
  return { config, vault, env: { CLAUDE_CONFIG_DIR: config, CLAUDE_PLUGIN_OPTION_VAULT_PATH: vault, CLAUDE_CODE_SESSION_ID: "sess-9" } };
}
const run = (args, env, input = "") => spawnSync("node", [SCRIPT, ...args], { input, env: { ...process.env, ...env }, encoding: "utf8" });

test("parseArgs splits the command, --flags with values, and the rest", () => {
  assert.deepEqual(parseArgs(["digest", "--topic", "dns", "--kind", "explained"]), { command: "digest", flags: { topic: "dns", kind: "explained" }, rest: [] });
  assert.deepEqual(parseArgs(["setup", "/a b"]), { command: "setup", flags: {}, rest: ["/a b"] });
});

test("pluginIdFor matches the installed plugin by real path", () => {
  const dir = mkdtempSync(join(tmpdir(), "pid-"));
  const real = join(dir, "real");
  mkdirSync(real);
  const link = join(dir, "link");
  symlinkSync(real, link);
  const list = [{ id: "other@x", installPath: join(dir, "nope") }, { id: "sensei@rishichawda", installPath: link }];
  assert.equal(pluginIdFor(list, real), "sensei@rishichawda");
  assert.equal(pluginIdFor(list, join(dir, "unrelated")), null);
  assert.equal(pluginIdFor([], real), null);
});

test("status reports configured and declined", () => {
  const { env } = setup();
  assert.deepEqual(JSON.parse(run(["status"], env).stdout), { configured: true, declined: false });
  const none = { CLAUDE_CONFIG_DIR: env.CLAUDE_CONFIG_DIR, CLAUDE_PLUGIN_OPTION_VAULT_PATH: "" };
  assert.deepEqual(JSON.parse(run(["status"], none).stdout), { configured: false, declined: false });
  assert.equal(run(["decline"], none).status, 0);
  assert.deepEqual(JSON.parse(run(["status"], none).stdout), { configured: false, declined: true });
});

test("status finds the vault through the saved-path file when the option is not in the environment", () => {
  const { env, vault } = setup();
  const noOption = { CLAUDE_CONFIG_DIR: env.CLAUDE_CONFIG_DIR, CLAUDE_PLUGIN_OPTION_VAULT_PATH: "" };
  saveVaultPath(vault, { CLAUDE_CONFIG_DIR: env.CLAUDE_CONFIG_DIR });
  assert.equal(JSON.parse(run(["status"], noOption).stdout).configured, true);
});

test("digest appends to the concept note under the session from the environment", () => {
  const { env, vault } = setup();
  const result = run(["digest", "--topic", "dns", "--node", "referrals", "--kind", "explained"], env, "A referral points to the next server.\n");
  assert.equal(result.status, 0, result.stderr);
  const note = readFileSync(join(vault, "sensei", "dns", "referrals.md"), "utf8");
  assert.ok(note.includes("<!-- sensei:session sess-9 -->"));
  assert.ok(note.endsWith("\n**Explained:** A referral points to the next server.\n"));
});

test("digest with no vault prints a note and exits 0", () => {
  const { env } = setup();
  const result = run(["digest", "--topic", "dns", "--node", "referrals", "--kind", "explained"], { ...env, CLAUDE_PLUGIN_OPTION_VAULT_PATH: "" }, "text");
  assert.equal(result.status, 0);
  assert.match(result.stdout, /no vault configured/);
});

test("digest rejects a bad slug, kind, empty text or missing session", () => {
  const { env, vault } = setup();
  const ok = ["digest", "--topic", "dns", "--node", "referrals", "--kind", "explained"];
  assert.equal(run(["digest", "--topic", "../x", "--node", "n", "--kind", "explained"], env, "t").status, 1);
  assert.equal(run(["digest", "--topic", "dns", "--node", "A b", "--kind", "explained"], env, "t").status, 1);
  assert.equal(run(["digest", "--topic", "dns", "--node", "n", "--kind", "wrong"], env, "t").status, 1);
  assert.equal(run(ok, env, "   \n").status, 1);
  assert.equal(run(ok, { ...env, CLAUDE_CODE_SESSION_ID: "" }, "t").status, 1);
  assert.equal(existsSync(join(vault, "sensei")), false);
});

test("digest cuts a very long text", () => {
  const { env, vault } = setup();
  run(["digest", "--topic", "dns", "--node", "referrals", "--kind", "re-explained"], env, "x".repeat(5000));
  const note = readFileSync(join(vault, "sensei", "dns", "referrals.md"), "utf8");
  assert.ok(note.includes("**Re-explained:** " + "x".repeat(2000) + "\n"));
  assert.ok(!note.includes("x".repeat(2001)));
});

test("setup refuses a relative path or a folder that does not exist", () => {
  const { env } = setup();
  assert.equal(run(["setup", "relative/path"], env).status, 1);
  assert.equal(run(["setup", join(env.CLAUDE_CONFIG_DIR, "missing")], env).status, 1);
  assert.equal(run(["setup"], env).status, 1);
});

test("an unknown command prints usage and exits 1", () => {
  assert.equal(run(["nope"], setup().env).status, 1);
});
