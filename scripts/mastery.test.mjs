import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import {
  slugify,
  getTopic,
  recordNode,
  listTopics,
  emptyTopicLedger,
  readTopicLedger,
  writeTopicLedger,
  ledgersDir,
  topicLedgerPath,
  getSession,
  touchSession,
  setSessionGoal,
  setSessionPlan,
  advanceSession,
  addProbe,
} from "./mastery.mjs";

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

test("emptyTopicLedger returns a versioned, empty per-topic ledger", () => {
  assert.deepEqual(emptyTopicLedger(), { version: 1, nodes: {}, session: null });
});

test("getSession returns null for a fresh topic ledger", () => {
  assert.equal(getSession(emptyTopicLedger()), null);
});

test("getSession returns the recorded session row", () => {
  const topicLedger = {
    version: 1,
    nodes: {},
    session: { goal: "learn fundamentals", dependencyMap: null, nextNodeId: null, status: "intake", updatedAt: "2026-01-01T00:00:00.000Z" },
  };
  assert.deepEqual(getSession(topicLedger), {
    goal: "learn fundamentals", dependencyMap: null, nextNodeId: null, status: "intake", updatedAt: "2026-01-01T00:00:00.000Z",
  });
});

test("getTopic returns an empty object for a fresh topic ledger", () => {
  assert.deepEqual(getTopic(emptyTopicLedger()), {});
});

test("getTopic returns the recorded nodes", () => {
  const topicLedger = { version: 1, nodes: { packets: { status: "passed", lastTaughtAt: "2026-01-01T00:00:00.000Z" } }, session: null };
  assert.deepEqual(getTopic(topicLedger), { packets: { status: "passed", lastTaughtAt: "2026-01-01T00:00:00.000Z" } });
});

test("recordNode adds a new node without mutating the input topic ledger", () => {
  const before = { version: 1, nodes: { dns: { status: "seen", lastTaughtAt: "2026-01-01T00:00:00.000Z" } }, session: null };
  const beforeNodesReference = before.nodes;
  const after = recordNode(before, "packets", "passed");
  assert.equal(before.nodes, beforeNodesReference, "input topic ledger's nodes object should not be reassigned");
  assert.deepEqual(before.nodes.dns, { status: "seen", lastTaughtAt: "2026-01-01T00:00:00.000Z" }, "input ledger sibling nodes should be unchanged");
  assert.equal(after.nodes.packets.status, "passed");
  assert.equal(typeof after.nodes.packets.lastTaughtAt, "string");
  assert.equal(after.nodes.dns.status, "seen", "output ledger should preserve sibling nodes");
  assert.equal(after.version, 1, "version should be preserved");
});

test("recordNode overwrites an existing node's status without disturbing sibling nodes", () => {
  const before = {
    version: 1,
    nodes: {
      packets: { status: "failed", lastTaughtAt: "2026-01-01T00:00:00.000Z" },
      tcp: { status: "seen", lastTaughtAt: "2026-01-01T00:00:00.000Z" },
    },
    session: null,
  };
  const after = recordNode(before, "packets", "passed");
  assert.equal(after.nodes.packets.status, "passed");
  assert.equal(after.nodes.tcp.status, "seen", "sibling node status should remain unchanged");
  assert.equal(after.nodes.tcp.lastTaughtAt, "2026-01-01T00:00:00.000Z", "sibling node lastTaughtAt should remain unchanged");
});

test("recordNode is a no-op (returns the exact same reference) when writing 'seen' over an existing 'passed' record", () => {
  const topicLedger = { version: 1, nodes: { packets: { status: "passed", lastTaughtAt: "2026-01-01T00:00:00.000Z" } }, session: null };
  const result = recordNode(topicLedger, "packets", "seen");
  assert.equal(result, topicLedger, "recordNode should return the exact same reference on a seen-over-existing no-op");
  assert.equal(topicLedger.nodes.packets.status, "passed", "existing passed status must not be disturbed");
  assert.equal(topicLedger.nodes.packets.lastTaughtAt, "2026-01-01T00:00:00.000Z", "lastTaughtAt must not be bumped on a no-op");
});

test("recordNode still overwrites when a real quiz-check result (passed) is written over an existing 'seen' record", () => {
  const topicLedger = { version: 1, nodes: { packets: { status: "seen", lastTaughtAt: "2026-01-01T00:00:00.000Z" } }, session: null };
  const result = recordNode(topicLedger, "packets", "passed");
  assert.notEqual(result, topicLedger, "passed writes must not be a no-op, even over a seen record");
  assert.equal(result.nodes.packets.status, "passed");
});

test("recordNode still creates a new record when writing 'seen' for a node with no prior record", () => {
  const topicLedger = { version: 1, nodes: {}, session: null };
  const result = recordNode(topicLedger, "packets", "seen");
  assert.notEqual(result, topicLedger, "seen writes on a genuinely new node must not be a no-op");
  assert.equal(result.nodes.packets.status, "seen");
  assert.equal(typeof result.nodes.packets.lastTaughtAt, "string");
});

test("touchSession creates a fresh intake row when none exists", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  const result = touchSession(emptyTopicLedger(), now);
  assert.deepEqual(result.session, {
    goal: null, dependencyMap: null, nextNodeId: null, status: "intake", updatedAt: "2026-01-01T00:00:00.000Z",
  });
});

test("touchSession is a no-op (same reference) when a session row already exists", () => {
  const topicLedger = touchSession(emptyTopicLedger(), new Date("2026-01-01T00:00:00.000Z"));
  const result = touchSession(topicLedger, new Date("2026-06-01T00:00:00.000Z"));
  assert.equal(result, topicLedger, "touchSession must not overwrite or bump updatedAt on an existing row");
});

test("addProbe creates the session row from the very first probe, before any node exists", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  const topicLedger = addProbe(emptyTopicLedger(), { question: "What's a cmdlet?", answer: "Not sure" }, now);
  assert.equal(topicLedger.session.status, "intake");
  assert.deepEqual(topicLedger.session.probes, [{ question: "What's a cmdlet?", answer: "Not sure", at: "2026-01-01T00:00:00.000Z" }]);
});

test("addProbe appends to an existing probe log without disturbing goal/dependencyMap", () => {
  let topicLedger = setSessionGoal(emptyTopicLedger(), "learn closures", new Date("2026-01-01T00:00:00.000Z"));
  topicLedger = addProbe(topicLedger, { question: "Q1", answer: "A1" }, new Date("2026-01-02T00:00:00.000Z"));
  topicLedger = addProbe(topicLedger, { question: "Q2", answer: "A2" }, new Date("2026-01-03T00:00:00.000Z"));
  assert.equal(topicLedger.session.goal, "learn closures");
  assert.deepEqual(topicLedger.session.probes, [
    { question: "Q1", answer: "A1", at: "2026-01-02T00:00:00.000Z" },
    { question: "Q2", answer: "A2", at: "2026-01-03T00:00:00.000Z" },
  ]);
});

test("addProbe caps the log at the most recent 50 entries", () => {
  let topicLedger = emptyTopicLedger();
  for (let i = 0; i < 55; i++) {
    topicLedger = addProbe(topicLedger, { question: `Q${i}`, answer: "A" }, new Date("2026-01-01T00:00:00.000Z"));
  }
  assert.equal(topicLedger.session.probes.length, 50);
  assert.equal(topicLedger.session.probes[0].question, "Q5");
  assert.equal(topicLedger.session.probes[49].question, "Q54");
});

test("setSessionGoal creates the session row if missing and sets the goal", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  const result = setSessionGoal(emptyTopicLedger(), "understand fundamentals broadly", now);
  assert.deepEqual(result.session, {
    goal: "understand fundamentals broadly", dependencyMap: null, nextNodeId: null, status: "intake", updatedAt: "2026-01-01T00:00:00.000Z",
  });
});

test("setSessionGoal overwrites a prior goal on an existing row without disturbing dependencyMap", () => {
  let topicLedger = setSessionPlan(emptyTopicLedger(), { nodes: ["a", "b"], edges: [["a", "b"]] }, new Date("2026-01-01T00:00:00.000Z"));
  topicLedger = setSessionGoal(topicLedger, "revised goal", new Date("2026-02-01T00:00:00.000Z"));
  assert.equal(topicLedger.session.goal, "revised goal");
  assert.deepEqual(topicLedger.session.dependencyMap, { nodes: ["a", "b"], edges: [["a", "b"]] }, "setSessionGoal must not touch dependencyMap");
});

test("setSessionPlan sets dependencyMap, points nextNodeId at the first node, and flips status to planned", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  const plan = { nodes: ["primitives", "typing", "functions"], edges: [["primitives", "typing"], ["typing", "functions"]] };
  const result = setSessionPlan(emptyTopicLedger(), plan, now);
  assert.deepEqual(result.session, {
    goal: null, dependencyMap: plan, nextNodeId: "primitives", status: "planned", updatedAt: "2026-01-01T00:00:00.000Z",
  });
});

test("setSessionPlan preserves an already-set goal", () => {
  let topicLedger = setSessionGoal(emptyTopicLedger(), "understand fundamentals", new Date("2026-01-01T00:00:00.000Z"));
  const plan = { nodes: ["primitives"], edges: [] };
  topicLedger = setSessionPlan(topicLedger, plan, new Date("2026-01-02T00:00:00.000Z"));
  assert.equal(topicLedger.session.goal, "understand fundamentals");
});

test("setSessionPlan sets nextNodeId to null for a plan with an empty node list", () => {
  const result = setSessionPlan(emptyTopicLedger(), { nodes: [], edges: [] }, new Date("2026-01-01T00:00:00.000Z"));
  assert.equal(result.session.nextNodeId, null);
});

test("advanceSession moves nextNodeId forward and flips status to in-progress on a passing grade at the current frontier", () => {
  const plan = { nodes: ["primitives", "typing", "functions"], edges: [] };
  let topicLedger = setSessionPlan(emptyTopicLedger(), plan, new Date("2026-01-01T00:00:00.000Z"));
  topicLedger = advanceSession(topicLedger, "primitives", "passed", new Date("2026-01-02T00:00:00.000Z"));
  assert.equal(topicLedger.session.nextNodeId, "typing");
  assert.equal(topicLedger.session.status, "in-progress");
});

test("advanceSession flips status to complete when the last node in the plan passes", () => {
  const plan = { nodes: ["only-node"], edges: [] };
  let topicLedger = setSessionPlan(emptyTopicLedger(), plan, new Date("2026-01-01T00:00:00.000Z"));
  topicLedger = advanceSession(topicLedger, "only-node", "passed", new Date("2026-01-02T00:00:00.000Z"));
  assert.equal(topicLedger.session.nextNodeId, null);
  assert.equal(topicLedger.session.status, "complete");
});

test("advanceSession flips status to in-progress on a failing grade too, but does not move nextNodeId", () => {
  const plan = { nodes: ["primitives", "typing"], edges: [] };
  let topicLedger = setSessionPlan(emptyTopicLedger(), plan, new Date("2026-01-01T00:00:00.000Z"));
  topicLedger = advanceSession(topicLedger, "primitives", "failed", new Date("2026-01-02T00:00:00.000Z"));
  assert.equal(topicLedger.session.nextNodeId, "primitives", "a failed node must stay the frontier so it gets re-taught");
  assert.equal(topicLedger.session.status, "in-progress");
});

test("advanceSession does not move nextNodeId when the graded node isn't the current frontier", () => {
  const plan = { nodes: ["primitives", "typing"], edges: [] };
  let topicLedger = setSessionPlan(emptyTopicLedger(), plan, new Date("2026-01-01T00:00:00.000Z"));
  topicLedger = advanceSession(topicLedger, "typing", "passed", new Date("2026-01-02T00:00:00.000Z"));
  assert.equal(topicLedger.session.nextNodeId, "primitives");
});

test("advanceSession is a no-op when there is no session row yet", () => {
  const topicLedger = emptyTopicLedger();
  const result = advanceSession(topicLedger, "primitives", "passed", new Date("2026-01-01T00:00:00.000Z"));
  assert.equal(result, topicLedger);
});

test("advanceSession is a no-op when the session has no dependencyMap yet", () => {
  const topicLedger = touchSession(emptyTopicLedger(), new Date("2026-01-01T00:00:00.000Z"));
  const result = advanceSession(topicLedger, "primitives", "passed", new Date("2026-01-02T00:00:00.000Z"));
  assert.equal(result, topicLedger);
});

test("listTopics returns an empty array when the ledgers directory doesn't exist yet", () => {
  const configDir = freshConfigDir();
  withConfigDir(configDir, () => {
    assert.deepEqual(listTopics(), []);
  });
});

test("listTopics returns every topic file's slug, sorted alphabetically", () => {
  const configDir = freshConfigDir();
  withConfigDir(configDir, () => {
    writeTopicLedger("powershell-scripting", recordNode(emptyTopicLedger(), "foo", "seen"));
    writeTopicLedger("networking", recordNode(emptyTopicLedger(), "packets", "passed"));
    assert.deepEqual(listTopics(), ["networking", "powershell-scripting"]);
  });
});

test("listTopics includes a topic that has a session file but no graded node yet", () => {
  const configDir = freshConfigDir();
  withConfigDir(configDir, () => {
    writeTopicLedger("powershell-scripting", touchSession(emptyTopicLedger(), new Date("2026-01-01T00:00:00.000Z")));
    assert.deepEqual(listTopics(), ["powershell-scripting"]);
  });
});

test("readTopicLedger returns emptyTopicLedger() when no file exists for this topic", () => {
  const configDir = freshConfigDir();
  withConfigDir(configDir, () => {
    assert.deepEqual(readTopicLedger("javascript"), emptyTopicLedger());
  });
});

test("readTopicLedger warns to stderr and returns emptyTopicLedger() when the file is corrupt", () => {
  const configDir = freshConfigDir();
  withConfigDir(configDir, () => {
    const path = topicLedgerPath("javascript");
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, "{ not valid json", "utf8");
    let stderrOutput = "";
    const originalError = console.error;
    console.error = (msg) => { stderrOutput += msg; };
    let result;
    try {
      result = readTopicLedger("javascript");
    } finally {
      console.error = originalError;
    }
    assert.deepEqual(result, emptyTopicLedger());
    assert.match(stderrOutput, /could not parse ledger/);
  });
});

test("readTopicLedger warns to stderr and returns emptyTopicLedger() when the file is a JSON array, not an object", () => {
  const configDir = freshConfigDir();
  withConfigDir(configDir, () => {
    const path = topicLedgerPath("javascript");
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify([1, 2, 3]), "utf8");
    let stderrOutput = "";
    const originalError = console.error;
    console.error = (msg) => { stderrOutput += msg; };
    let result;
    try {
      result = readTopicLedger("javascript");
    } finally {
      console.error = originalError;
    }
    assert.deepEqual(result, emptyTopicLedger());
    assert.match(stderrOutput, /unrecognized shape/);
  });
});

test("readTopicLedger defaults nodes to {} when the file predates the nodes key, without losing session", () => {
  const configDir = freshConfigDir();
  withConfigDir(configDir, () => {
    const path = topicLedgerPath("javascript");
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ version: 1, session: { goal: "x", dependencyMap: null, nextNodeId: null, status: "intake", updatedAt: "2026-01-01T00:00:00.000Z" } }), "utf8");
    const result = readTopicLedger("javascript");
    assert.deepEqual(result.nodes, {});
    assert.equal(result.session.goal, "x");
  });
});

test("readTopicLedger defaults session to null when the session key is malformed, without losing nodes", () => {
  const configDir = freshConfigDir();
  withConfigDir(configDir, () => {
    const path = topicLedgerPath("javascript");
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ version: 1, nodes: { dynamic: { status: "seen", lastTaughtAt: "2026-01-01T00:00:00.000Z" } }, session: "not an object" }), "utf8");
    const result = readTopicLedger("javascript");
    assert.deepEqual(result, { version: 1, nodes: { dynamic: { status: "seen", lastTaughtAt: "2026-01-01T00:00:00.000Z" } }, session: null });
  });
});

test("writeTopicLedger writes atomically and readTopicLedger reads back exactly what was written", () => {
  const configDir = freshConfigDir();
  withConfigDir(configDir, () => {
    const topicLedger = recordNode(emptyTopicLedger(), "packets", "passed");
    writeTopicLedger("networking", topicLedger);
    assert.deepEqual(readTopicLedger("networking"), topicLedger);
  });
});

test("writeTopicLedger for one topic never touches a sibling topic's file", () => {
  const configDir = freshConfigDir();
  withConfigDir(configDir, () => {
    writeTopicLedger("javascript", recordNode(emptyTopicLedger(), "closures", "passed"));
    const before = readFileSync(topicLedgerPath("javascript"), "utf8");
    writeTopicLedger("rust", recordNode(emptyTopicLedger(), "ownership", "passed"));
    const after = readFileSync(topicLedgerPath("javascript"), "utf8");
    assert.equal(after, before, "writing rust's ledger file must not touch javascript's file at all");
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
    const topicLedger = setSessionGoal(emptyTopicLedger(), "understand fundamentals", new Date("2026-01-01T00:00:00.000Z"));
    writeTopicLedger("javascript", topicLedger);
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

test("CLI topics on an empty ledgers directory prints an empty array", () => {
  const configDir = freshConfigDir();
  const env = { ...process.env, CLAUDE_CONFIG_DIR: configDir };
  const output = execFileSync("node", [SCRIPT, "topics"], { env }).toString().trim();
  assert.equal(output, "[]");
});

test("CLI record with 'seen' over an existing 'passed' node prints 'unchanged' and does not touch the topic's file", () => {
  const configDir = freshConfigDir();
  const env = { ...process.env, CLAUDE_CONFIG_DIR: configDir };
  execFileSync("node", [SCRIPT, "record", "Networking", "Packets", "passed"], { env });
  let before;
  withConfigDir(configDir, () => {
    before = readFileSync(topicLedgerPath("networking"), "utf8");
  });

  const output = execFileSync("node", [SCRIPT, "record", "Networking", "Packets", "seen"], { env }).toString();
  assert.match(output, /unchanged: networking packets already passed/);
  assert.doesNotMatch(output, /recorded:/);

  let after;
  withConfigDir(configDir, () => {
    after = readFileSync(topicLedgerPath("networking"), "utf8");
  });
  assert.equal(after, before, "ledger file on disk must be byte-identical after a no-op seen write");

  const parsed = JSON.parse(after);
  assert.equal(parsed.nodes.packets.status, "passed");
});

test("CLI topics lists every recorded topic slug alphabetically", () => {
  const configDir = freshConfigDir();
  const env = { ...process.env, CLAUDE_CONFIG_DIR: configDir };
  execFileSync("node", [SCRIPT, "record", "PowerShell Scripting", "objects", "seen"], { env });
  execFileSync("node", [SCRIPT, "record", "Networking", "packets", "seen"], { env });
  const output = execFileSync("node", [SCRIPT, "topics"], { env }).toString().trim();
  assert.deepEqual(JSON.parse(output), ["networking", "powershell-scripting"]);
});

test("two topics' ledger files never share state: recording one never affects the other, even under interleaved writes", () => {
  const configDir = freshConfigDir();
  const env = { ...process.env, CLAUDE_CONFIG_DIR: configDir };
  execFileSync("node", [SCRIPT, "record", "javascript", "closures", "passed"], { env });
  execFileSync("node", [SCRIPT, "record", "rust", "ownership", "passed"], { env });
  execFileSync("node", [SCRIPT, "record", "javascript", "this-binding", "failed"], { env });

  const js = JSON.parse(execFileSync("node", [SCRIPT, "get", "javascript"], { env }).toString().trim());
  const rust = JSON.parse(execFileSync("node", [SCRIPT, "get", "rust"], { env }).toString().trim());
  assert.equal(js.closures.status, "passed");
  assert.equal(js["this-binding"].status, "failed");
  assert.equal(rust.ownership.status, "passed");
  assert.equal(Object.keys(rust).length, 1, "rust's file must not have picked up javascript's nodes");
});

test("ledgersDir resolves under CLAUDE_CONFIG_DIR/sensei/ledgers", () => {
  const configDir = freshConfigDir();
  withConfigDir(configDir, () => {
    assert.equal(ledgersDir(), join(configDir, "sensei", "ledgers"));
  });
});
