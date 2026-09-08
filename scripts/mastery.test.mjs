import { test } from "node:test";
import assert from "node:assert/strict";
import { slugify, getTopic, recordNode } from "./mastery.mjs";

test("slugify lowercases, hyphenates, and trims", () => {
  assert.equal(slugify("Internet Packets!!"), "internet-packets");
  assert.equal(slugify("  TCP/IP  "), "tcp-ip");
});

test("slugify falls back to 'topic' when nothing alphanumeric survives", () => {
  assert.equal(slugify("!!!"), "topic");
});

test("getTopic returns an empty object for an unknown topic slug", () => {
  assert.deepEqual(getTopic({}, "networking"), {});
});

test("getTopic returns the recorded nodes for a known topic slug", () => {
  const ledger = { networking: { packets: { status: "passed", lastTaughtAt: "2026-01-01T00:00:00.000Z" } } };
  assert.deepEqual(getTopic(ledger, "networking"), { packets: { status: "passed", lastTaughtAt: "2026-01-01T00:00:00.000Z" } });
});

test("recordNode adds a new topic and node without mutating the input ledger", () => {
  const before = {
    networking: {
      dns: { status: "seen", lastTaughtAt: "2026-01-01T00:00:00.000Z" },
    },
  };
  const beforeNetworkingReference = before.networking;
  const after = recordNode(before, "networking", "packets", "passed");
  assert.equal(before.networking, beforeNetworkingReference, "input ledger topic object should not be reassigned");
  assert.deepEqual(before.networking.dns, { status: "seen", lastTaughtAt: "2026-01-01T00:00:00.000Z" }, "input ledger sibling nodes should be unchanged");
  assert.equal(after.networking.packets.status, "passed");
  assert.equal(typeof after.networking.packets.lastTaughtAt, "string");
  assert.equal(after.networking.dns.status, "seen", "output ledger should preserve sibling nodes");
});

test("recordNode overwrites an existing node's status without disturbing sibling nodes", () => {
  const before = {
    networking: {
      packets: { status: "failed", lastTaughtAt: "2026-01-01T00:00:00.000Z" },
      tcp: { status: "seen", lastTaughtAt: "2026-01-01T00:00:00.000Z" },
    },
  };
  const after = recordNode(before, "networking", "packets", "passed");
  assert.equal(after.networking.packets.status, "passed");
  assert.equal(after.networking.tcp.status, "seen", "sibling node status should remain unchanged");
  assert.equal(after.networking.tcp.lastTaughtAt, "2026-01-01T00:00:00.000Z", "sibling node lastTaughtAt should remain unchanged");
});

import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = new URL("./mastery.mjs", import.meta.url).pathname;

function freshConfigDir() {
  return mkdtempSync(join(tmpdir(), "mastery-cli-test-"));
}

test("CLI get on an unrecorded topic prints an empty object", () => {
  const configDir = freshConfigDir();
  const output = execFileSync("node", [SCRIPT, "get", "Networking"], {
    env: { ...process.env, CLAUDE_CONFIG_DIR: configDir },
  }).toString().trim();
  assert.equal(output, "{}");
});

test("CLI record then get round-trips the recorded node", () => {
  const configDir = freshConfigDir();
  const env = { ...process.env, CLAUDE_CONFIG_DIR: configDir };
  const recordOutput = execFileSync("node", [SCRIPT, "record", "Networking", "Packets", "passed"], { env }).toString();
  assert.match(recordOutput, /recorded: networking packets -> passed/);

  const getOutput = execFileSync("node", [SCRIPT, "get", "Networking"], { env }).toString().trim();
  const parsed = JSON.parse(getOutput);
  assert.equal(parsed.packets.status, "passed");
  assert.equal(typeof parsed.packets.lastTaughtAt, "string");
});

test("CLI record rejects an invalid status", () => {
  const configDir = freshConfigDir();
  const env = { ...process.env, CLAUDE_CONFIG_DIR: configDir };
  assert.throws(
    () => execFileSync("node", [SCRIPT, "record", "Networking", "Packets", "mastered"], { env, stdio: "pipe" }),
    (err) => /invalid status "mastered"/.test(err.stderr.toString())
  );
});

test("CLI record requires all three arguments", () => {
  const configDir = freshConfigDir();
  const env = { ...process.env, CLAUDE_CONFIG_DIR: configDir };
  assert.throws(
    () => execFileSync("node", [SCRIPT, "record", "Networking", "Packets"], { env, stdio: "pipe" }),
    (err) => /Usage: mastery\.mjs record/.test(err.stderr.toString())
  );
});

test("CLI rejects an unknown subcommand", () => {
  const configDir = freshConfigDir();
  const env = { ...process.env, CLAUDE_CONFIG_DIR: configDir };
  assert.throws(
    () => execFileSync("node", [SCRIPT, "list"], { env, stdio: "pipe" }),
    (err) => /Usage: mastery\.mjs <get\|record>/.test(err.stderr.toString())
  );
});
