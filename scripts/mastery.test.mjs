import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { slugify, getTopic, recordNode, listTopics, emptyLedger, readLedger, writeLedger, ledgerPath, getSession, touchSession, setSessionGoal, setSessionPlan, advanceSession } from "./mastery.mjs";

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

test("emptyLedger returns a versioned ledger with no topics and no sessions", () => {
  assert.deepEqual(emptyLedger(), { version: 1, topics: {}, sessions: {} });
});

test("getSession returns null for a topic with no session row", () => {
  assert.equal(getSession(emptyLedger(), "javascript"), null);
});

test("getSession returns the recorded session row for a known topic slug", () => {
  const ledger = {
    version: 1,
    topics: {},
    sessions: { javascript: { goal: "learn fundamentals", dependencyMap: null, nextNodeId: null, status: "intake", updatedAt: "2026-01-01T00:00:00.000Z" } },
  };
  assert.deepEqual(getSession(ledger, "javascript"), {
    goal: "learn fundamentals", dependencyMap: null, nextNodeId: null, status: "intake", updatedAt: "2026-01-01T00:00:00.000Z",
  });
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

test("recordNode is a no-op (returns the exact same ledger reference) when writing 'seen' over an existing 'passed' record", () => {
  const ledger = {
    version: 1,
    topics: {
      networking: {
        packets: { status: "passed", lastTaughtAt: "2026-01-01T00:00:00.000Z" },
      },
    },
  };
  const result = recordNode(ledger, "networking", "packets", "seen");
  assert.equal(result, ledger, "recordNode should return the exact same ledger reference on a seen-over-existing no-op");
  assert.equal(ledger.topics.networking.packets.status, "passed", "existing passed status must not be disturbed");
  assert.equal(ledger.topics.networking.packets.lastTaughtAt, "2026-01-01T00:00:00.000Z", "lastTaughtAt must not be bumped on a no-op");
});

test("recordNode still overwrites when a real quiz-check result (passed) is written over an existing 'seen' record", () => {
  const ledger = {
    version: 1,
    topics: {
      networking: {
        packets: { status: "seen", lastTaughtAt: "2026-01-01T00:00:00.000Z" },
      },
    },
  };
  const result = recordNode(ledger, "networking", "packets", "passed");
  assert.notEqual(result, ledger, "passed writes must not be a no-op, even over a seen record");
  assert.equal(result.topics.networking.packets.status, "passed");
});

test("recordNode still creates a new record when writing 'seen' for a node with no prior record", () => {
  const ledger = { version: 1, topics: { networking: {} } };
  const result = recordNode(ledger, "networking", "packets", "seen");
  assert.notEqual(result, ledger, "seen writes on a genuinely new node must not be a no-op");
  assert.equal(result.topics.networking.packets.status, "seen");
  assert.equal(typeof result.topics.networking.packets.lastTaughtAt, "string");
});

test("listTopics returns an empty array for an empty ledger", () => {
  assert.deepEqual(listTopics(emptyLedger()), []);
});

test("listTopics returns all topic slugs sorted alphabetically", () => {
  const ledger = {
    version: 1,
    topics: {
      "powershell-scripting": { foo: { status: "seen", lastTaughtAt: "2026-01-01T00:00:00.000Z" } },
      networking: { packets: { status: "passed", lastTaughtAt: "2026-01-01T00:00:00.000Z" } },
    },
  };
  assert.deepEqual(listTopics(ledger), ["networking", "powershell-scripting"]);
});

test("touchSession creates a fresh intake row when none exists", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  const result = touchSession(emptyLedger(), "javascript", now);
  assert.deepEqual(result.sessions.javascript, {
    goal: null, dependencyMap: null, nextNodeId: null, status: "intake", updatedAt: "2026-01-01T00:00:00.000Z",
  });
});

test("touchSession is a no-op (same ledger reference) when a session row already exists", () => {
  const ledger = touchSession(emptyLedger(), "javascript", new Date("2026-01-01T00:00:00.000Z"));
  const result = touchSession(ledger, "javascript", new Date("2026-06-01T00:00:00.000Z"));
  assert.equal(result, ledger, "touchSession must not overwrite or bump updatedAt on an existing row");
});

test("touchSession does not disturb an existing session for a sibling topic", () => {
  let ledger = touchSession(emptyLedger(), "javascript", new Date("2026-01-01T00:00:00.000Z"));
  ledger = touchSession(ledger, "rust", new Date("2026-02-01T00:00:00.000Z"));
  assert.ok(ledger.sessions.javascript, "javascript session must survive touching a different topic");
  assert.ok(ledger.sessions.rust, "rust session must be created");
});

test("setSessionGoal creates the session row if missing and sets the goal", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  const result = setSessionGoal(emptyLedger(), "javascript", "understand fundamentals broadly", now);
  assert.deepEqual(result.sessions.javascript, {
    goal: "understand fundamentals broadly", dependencyMap: null, nextNodeId: null, status: "intake", updatedAt: "2026-01-01T00:00:00.000Z",
  });
});

test("setSessionGoal overwrites a prior goal on an existing row without disturbing dependencyMap", () => {
  let ledger = setSessionPlan(emptyLedger(), "javascript", { nodes: ["a", "b"], edges: [["a", "b"]] }, new Date("2026-01-01T00:00:00.000Z"));
  ledger = setSessionGoal(ledger, "javascript", "revised goal", new Date("2026-02-01T00:00:00.000Z"));
  assert.equal(ledger.sessions.javascript.goal, "revised goal");
  assert.deepEqual(ledger.sessions.javascript.dependencyMap, { nodes: ["a", "b"], edges: [["a", "b"]] }, "setSessionGoal must not touch dependencyMap");
});

test("setSessionPlan sets dependencyMap, points nextNodeId at the first node, and flips status to planned", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  const plan = { nodes: ["primitives", "typing", "functions"], edges: [["primitives", "typing"], ["typing", "functions"]] };
  const result = setSessionPlan(emptyLedger(), "javascript", plan, now);
  assert.deepEqual(result.sessions.javascript, {
    goal: null, dependencyMap: plan, nextNodeId: "primitives", status: "planned", updatedAt: "2026-01-01T00:00:00.000Z",
  });
});

test("setSessionPlan preserves an already-set goal", () => {
  let ledger = setSessionGoal(emptyLedger(), "javascript", "understand fundamentals", new Date("2026-01-01T00:00:00.000Z"));
  const plan = { nodes: ["primitives"], edges: [] };
  ledger = setSessionPlan(ledger, "javascript", plan, new Date("2026-01-02T00:00:00.000Z"));
  assert.equal(ledger.sessions.javascript.goal, "understand fundamentals");
});

test("setSessionPlan sets nextNodeId to null for a plan with an empty node list", () => {
  const result = setSessionPlan(emptyLedger(), "javascript", { nodes: [], edges: [] }, new Date("2026-01-01T00:00:00.000Z"));
  assert.equal(result.sessions.javascript.nextNodeId, null);
});

test("advanceSession moves nextNodeId forward and flips status to in-progress on a passing grade at the current frontier", () => {
  const plan = { nodes: ["primitives", "typing", "functions"], edges: [] };
  let ledger = setSessionPlan(emptyLedger(), "javascript", plan, new Date("2026-01-01T00:00:00.000Z"));
  ledger = advanceSession(ledger, "javascript", "primitives", "passed", new Date("2026-01-02T00:00:00.000Z"));
  assert.equal(ledger.sessions.javascript.nextNodeId, "typing");
  assert.equal(ledger.sessions.javascript.status, "in-progress");
});

test("advanceSession flips status to complete when the last node in the plan passes", () => {
  const plan = { nodes: ["only-node"], edges: [] };
  let ledger = setSessionPlan(emptyLedger(), "javascript", plan, new Date("2026-01-01T00:00:00.000Z"));
  ledger = advanceSession(ledger, "javascript", "only-node", "passed", new Date("2026-01-02T00:00:00.000Z"));
  assert.equal(ledger.sessions.javascript.nextNodeId, null);
  assert.equal(ledger.sessions.javascript.status, "complete");
});

test("advanceSession flips status to in-progress on a failing grade too, but does not move nextNodeId", () => {
  const plan = { nodes: ["primitives", "typing"], edges: [] };
  let ledger = setSessionPlan(emptyLedger(), "javascript", plan, new Date("2026-01-01T00:00:00.000Z"));
  ledger = advanceSession(ledger, "javascript", "primitives", "failed", new Date("2026-01-02T00:00:00.000Z"));
  assert.equal(ledger.sessions.javascript.nextNodeId, "primitives", "a failed node must stay the frontier so it gets re-taught");
  assert.equal(ledger.sessions.javascript.status, "in-progress");
});

test("advanceSession does not move nextNodeId when the graded node isn't the current frontier", () => {
  const plan = { nodes: ["primitives", "typing"], edges: [] };
  let ledger = setSessionPlan(emptyLedger(), "javascript", plan, new Date("2026-01-01T00:00:00.000Z"));
  ledger = advanceSession(ledger, "javascript", "typing", "passed", new Date("2026-01-02T00:00:00.000Z"));
  assert.equal(ledger.sessions.javascript.nextNodeId, "primitives");
});

test("advanceSession is a no-op when there is no session row for the topic", () => {
  const ledger = emptyLedger();
  const result = advanceSession(ledger, "javascript", "primitives", "passed", new Date("2026-01-01T00:00:00.000Z"));
  assert.equal(result, ledger);
});

test("advanceSession is a no-op when the session has no dependencyMap yet", () => {
  const ledger = touchSession(emptyLedger(), "javascript", new Date("2026-01-01T00:00:00.000Z"));
  const result = advanceSession(ledger, "javascript", "primitives", "passed", new Date("2026-01-02T00:00:00.000Z"));
  assert.equal(result, ledger);
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

test("readLedger defaults sessions to {} when the ledger file predates the sessions key", () => {
  const configDir = freshConfigDir();
  withConfigDir(configDir, () => {
    const path = ledgerPath();
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ version: 1, topics: { javascript: {} } }), "utf8");
    const result = readLedger();
    assert.deepEqual(result, { version: 1, topics: { javascript: {} }, sessions: {} });
  });
});

test("readLedger defaults sessions to {} when the sessions key is malformed, without losing topics", () => {
  const configDir = freshConfigDir();
  withConfigDir(configDir, () => {
    const path = ledgerPath();
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ version: 1, topics: { javascript: {} }, sessions: "not an object" }), "utf8");
    const result = readLedger();
    assert.deepEqual(result, { version: 1, topics: { javascript: {} }, sessions: {} });
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

test("CLI get-session on a topic with no session row prints null", () => {
  const configDir = freshConfigDir();
  const env = { ...process.env, CLAUDE_CONFIG_DIR: configDir };
  const output = execFileSync("node", [SCRIPT, "get-session", "Javascript"], { env }).toString().trim();
  assert.equal(output, "null");
});

test("CLI get-session requires a topic argument", () => {
  const configDir = freshConfigDir();
  const env = { ...process.env, CLAUDE_CONFIG_DIR: configDir };
  assert.throws(
    () => execFileSync("node", [SCRIPT, "get-session"], { env, stdio: "pipe" }),
    (err) => /Usage: mastery\.mjs get-session/.test(err.stderr.toString())
  );
});

test("CLI get-session prints the session row written by touchSession/setSessionGoal, keyed by the slugified topic", () => {
  const configDir = freshConfigDir();
  withConfigDir(configDir, () => {
    const ledger = setSessionGoal(emptyLedger(), "javascript", "understand fundamentals", new Date("2026-01-01T00:00:00.000Z"));
    writeLedger(ledger);
  });
  const env = { ...process.env, CLAUDE_CONFIG_DIR: configDir };
  const output = execFileSync("node", [SCRIPT, "get-session", "JavaScript"], { env }).toString().trim();
  const parsed = JSON.parse(output);
  assert.equal(parsed.goal, "understand fundamentals");
  assert.equal(parsed.status, "intake");
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
    (err) => /Usage: mastery\.mjs <get\|get-session\|record\|topics>/.test(err.stderr.toString())
  );
});

test("CLI topics on an empty ledger prints an empty array", () => {
  const configDir = freshConfigDir();
  const env = { ...process.env, CLAUDE_CONFIG_DIR: configDir };
  const output = execFileSync("node", [SCRIPT, "topics"], { env }).toString().trim();
  assert.equal(output, "[]");
});

test("CLI record with 'seen' over an existing 'passed' node prints 'unchanged' and does not touch the ledger file", () => {
  const configDir = freshConfigDir();
  const env = { ...process.env, CLAUDE_CONFIG_DIR: configDir };
  execFileSync("node", [SCRIPT, "record", "Networking", "Packets", "passed"], { env });
  let before;
  withConfigDir(configDir, () => {
    before = readFileSync(ledgerPath(), "utf8");
  });

  const output = execFileSync("node", [SCRIPT, "record", "Networking", "Packets", "seen"], { env }).toString();
  assert.match(output, /unchanged: networking packets already passed/);
  assert.doesNotMatch(output, /recorded:/);

  let after;
  withConfigDir(configDir, () => {
    after = readFileSync(ledgerPath(), "utf8");
  });
  assert.equal(after, before, "ledger file on disk must be byte-identical after a no-op seen write");

  const parsed = JSON.parse(after);
  assert.equal(parsed.topics.networking.packets.status, "passed");
});

test("CLI topics lists every recorded topic slug alphabetically", () => {
  const configDir = freshConfigDir();
  const env = { ...process.env, CLAUDE_CONFIG_DIR: configDir };
  execFileSync("node", [SCRIPT, "record", "PowerShell Scripting", "objects", "seen"], { env });
  execFileSync("node", [SCRIPT, "record", "Networking", "packets", "seen"], { env });
  const output = execFileSync("node", [SCRIPT, "topics"], { env }).toString().trim();
  assert.deepEqual(JSON.parse(output), ["networking", "powershell-scripting"]);
});
