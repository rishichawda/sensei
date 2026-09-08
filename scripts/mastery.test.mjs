import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { slugify, getTopic, recordNode, emptyLedger, readLedger, writeLedger, ledgerPath } from "./mastery.mjs";

const SCRIPT = new URL("./mastery.mjs", import.meta.url).pathname;

function freshConfigDir() {
  return mkdtempSync(join(tmpdir(), "mastery-cli-test-"));
}

function withConfigDir(configDir, fn) {
  const original = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = configDir;
  try {
    return fn();
  } finally {
    if (original === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = original;
  }
}

test("slugify lowercases, hyphenates, and trims", () => {
  assert.equal(slugify("Internet Packets!!"), "internet-packets");
  assert.equal(slugify("  TCP/IP  "), "tcp-ip");
});

test("slugify falls back to 'topic' when nothing alphanumeric survives", () => {
  assert.equal(slugify("!!!"), "topic");
});

test("emptyLedger returns a versioned ledger with no topics", () => {
  assert.deepEqual(emptyLedger(), { version: 1, topics: {} });
});

test("getTopic returns an empty object for an unknown topic slug", () => {
  assert.deepEqual(getTopic(emptyLedger(), "networking"), {});
});

test("getTopic returns the recorded nodes for a known topic slug", () => {
  const ledger = { version: 1, topics: { networking: { packets: { status: "passed", lastTaughtAt: "2026-01-01T00:00:00.000Z" } } } };
  assert.deepEqual(getTopic(ledger, "networking"), { packets: { status: "passed", lastTaughtAt: "2026-01-01T00:00:00.000Z" } });
});

test("recordNode adds a new topic and node without mutating the input ledger", () => {
  const before = {
    version: 1,
    topics: {
      networking: {
        dns: { status: "seen", lastTaughtAt: "2026-01-01T00:00:00.000Z" },
      },
    },
  };
  const beforeNetworkingReference = before.topics.networking;
  const after = recordNode(before, "networking", "packets", "passed");
  assert.equal(before.topics.networking, beforeNetworkingReference, "input ledger topic object should not be reassigned");
  assert.deepEqual(before.topics.networking.dns, { status: "seen", lastTaughtAt: "2026-01-01T00:00:00.000Z" }, "input ledger sibling nodes should be unchanged");
  assert.equal(after.topics.networking.packets.status, "passed");
  assert.equal(typeof after.topics.networking.packets.lastTaughtAt, "string");
  assert.equal(after.topics.networking.dns.status, "seen", "output ledger should preserve sibling nodes");
  assert.equal(after.version, 1, "version should be preserved");
});

test("recordNode overwrites an existing node's status without disturbing sibling nodes", () => {
  const before = {
    version: 1,
    topics: {
      networking: {
        packets: { status: "failed", lastTaughtAt: "2026-01-01T00:00:00.000Z" },
        tcp: { status: "seen", lastTaughtAt: "2026-01-01T00:00:00.000Z" },
      },
    },
  };
  const after = recordNode(before, "networking", "packets", "passed");
  assert.equal(after.topics.networking.packets.status, "passed");
  assert.equal(after.topics.networking.tcp.status, "seen", "sibling node status should remain unchanged");
  assert.equal(after.topics.networking.tcp.lastTaughtAt, "2026-01-01T00:00:00.000Z", "sibling node lastTaughtAt should remain unchanged");
});

test("readLedger returns emptyLedger() when no file exists", () => {
  const configDir = freshConfigDir();
  withConfigDir(configDir, () => {
    assert.deepEqual(readLedger(), emptyLedger());
  });
});

test("readLedger warns to stderr and returns emptyLedger() when the file is corrupt", () => {
  const configDir = freshConfigDir();
  withConfigDir(configDir, () => {
    const path = ledgerPath();
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, "{ not valid json", "utf8");
    let stderrOutput = "";
    const originalError = console.error;
    console.error = (msg) => { stderrOutput += msg; };
    let result;
    try {
      result = readLedger();
    } finally {
      console.error = originalError;
    }
    assert.deepEqual(result, emptyLedger());
    assert.match(stderrOutput, /could not parse ledger/);
  });
});

test("readLedger warns to stderr and returns emptyLedger() when topics is null", () => {
  const configDir = freshConfigDir();
  withConfigDir(configDir, () => {
    const path = ledgerPath();
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ version: 1, topics: null }), "utf8");
    let stderrOutput = "";
    const originalError = console.error;
    console.error = (msg) => { stderrOutput += msg; };
    let result;
    try {
      result = readLedger();
    } finally {
      console.error = originalError;
    }
    assert.deepEqual(result, emptyLedger());
    assert.match(stderrOutput, /unrecognized shape/);
  });
});

test("writeLedger writes atomically and readLedger reads back exactly what was written", () => {
  const configDir = freshConfigDir();
  withConfigDir(configDir, () => {
    const ledger = recordNode(emptyLedger(), "networking", "packets", "passed");
    writeLedger(ledger);
    assert.deepEqual(readLedger(), ledger);
  });
});

test("CLI get on an unrecorded topic prints an empty object", () => {
  const configDir = freshConfigDir();
  const output = execFileSync("node", [SCRIPT, "get", "Networking"], {
    env: { ...process.env, CLAUDE_CONFIG_DIR: configDir },
  }).toString().trim();
  assert.equal(output, "{}");
});

test("CLI get requires a topic argument", () => {
  const configDir = freshConfigDir();
  const env = { ...process.env, CLAUDE_CONFIG_DIR: configDir };
  assert.throws(
    () => execFileSync("node", [SCRIPT, "get"], { env, stdio: "pipe" }),
    (err) => /Usage: mastery\.mjs get/.test(err.stderr.toString())
  );
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
