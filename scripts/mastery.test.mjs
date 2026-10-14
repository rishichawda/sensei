import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
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
  setProposedPlan,
  advanceSession,
  deriveSession,
  addProbe,
  normalizeStrand,
  summarizeStrands,
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

const T1 = new Date("2026-01-01T00:00:00.000Z");
const T2 = new Date("2026-01-02T00:00:00.000Z");

function planned(plan, statuses = {}) {
  let tl = setSessionPlan(emptyTopicLedger(), plan, T1);
  for (const [id, status] of Object.entries(statuses)) tl = recordNode(tl, id, status, T1);
  return tl;
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

test("recordNode uses the injected now instead of calling new Date() internally", () => {
  const before = { version: 1, nodes: {}, session: null };
  const after = recordNode(before, "packets", "passed", new Date("2026-03-05T12:00:00.000Z"));
  assert.equal(after.nodes.packets.lastTaughtAt, "2026-03-05T12:00:00.000Z");
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

test("addProbe caps the log at the most recent 20 entries", () => {
  let topicLedger = emptyTopicLedger();
  for (let i = 0; i < 25; i++) {
    topicLedger = addProbe(topicLedger, { question: `Q${i}`, answer: "A" }, new Date("2026-01-01T00:00:00.000Z"));
  }
  assert.equal(topicLedger.session.probes.length, 20);
  assert.equal(topicLedger.session.probes[0].question, "Q5");
  assert.equal(topicLedger.session.probes[19].question, "Q24");
});

test("setSessionGoal creates the session row if missing and sets the goal", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  const result = setSessionGoal(emptyTopicLedger(), "understand fundamentals broadly", now);
  assert.deepEqual(result.session, {
    goal: "understand fundamentals broadly", dependencyMap: null, nextNodeId: null, status: "intake", updatedAt: "2026-01-01T00:00:00.000Z",
  });
});

test("setSessionGoal on an intake row sets the goal, keeps the logged probes, and may be called again", () => {
  let tl = addProbe(emptyTopicLedger(), { question: "Q", answer: "A" }, T1);
  tl = setSessionGoal(tl, "first goal", T2);
  assert.equal(tl.session.goal, "first goal");
  assert.equal(tl.session.status, "intake");
  assert.equal(tl.session.probes.length, 1);
  tl = setSessionGoal(tl, "narrowed goal", T2);
  assert.equal(tl.session.goal, "narrowed goal");
  assert.equal(tl.session.probes.length, 1, "a second goal call during intake must not wipe the probes");
});

for (const status of ["planned", "in-progress", "complete"]) {
  test(`setSessionGoal on a ${status} row starts a fresh intake session and keeps per-node mastery`, () => {
    let tl = setSessionGoal(emptyTopicLedger(), "old goal", T1);
    tl = setSessionPlan(tl, { nodes: ["a", "b"], edges: [["a", "b"]] }, T1);
    tl = addProbe(tl, { question: "Q", answer: "A" }, T1);
    tl = recordNode(tl, "a", "passed", T1);
    tl = { ...tl, session: { ...tl.session, status } };
    const result = setSessionGoal(tl, "new goal", T2);
    assert.deepEqual(result.session, { goal: "new goal", dependencyMap: null, nextNodeId: null, status: "intake", updatedAt: T2.toISOString() });
    assert.deepEqual(result.nodes, tl.nodes, "per-node mastery must survive a new goal");
    assert.equal(tl.session.goal, "old goal", "the input ledger must not be mutated");
  });
}

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

test("advanceSession moves nextNodeId to the next unpassed node and flips status to in-progress after a pass", () => {
  const tl = planned({ nodes: ["primitives", "typing", "functions"], edges: [] }, { primitives: "passed" });
  const result = advanceSession(tl, T2);
  assert.equal(result.session.nextNodeId, "typing");
  assert.equal(result.session.status, "in-progress");
  assert.equal(result.session.updatedAt, T2.toISOString());
});

test("advanceSession flips status to complete when the last node in the plan passes", () => {
  const tl = planned({ nodes: ["only-node"], edges: [] }, { "only-node": "passed" });
  const result = advanceSession(tl, T2);
  assert.equal(result.session.nextNodeId, null);
  assert.equal(result.session.status, "complete");
});

test("advanceSession keeps a failed node as the frontier and flips status to in-progress", () => {
  const tl = planned({ nodes: ["primitives", "typing"], edges: [] }, { primitives: "failed" });
  const result = advanceSession(tl, T2);
  assert.equal(result.session.nextNodeId, "primitives", "a failed node must stay the frontier so it gets re-taught");
  assert.equal(result.session.status, "in-progress");
});

test("advanceSession skips nodes that were already passed, earlier or out of order", () => {
  const tl = planned({ nodes: ["a", "b", "c", "d"], edges: [] }, { a: "passed", c: "passed" });
  assert.equal(advanceSession(tl, T2).session.nextNodeId, "b");
  const all = planned({ nodes: ["a", "b", "c"], edges: [] }, { a: "passed", b: "passed", c: "passed" });
  assert.equal(advanceSession(all, T2).session.status, "complete");
});

test("advanceSession leaves the frontier at the first unpassed node when a later node passes first", () => {
  const tl = planned({ nodes: ["primitives", "typing"], edges: [] }, { typing: "passed" });
  const result = advanceSession(tl, T2);
  assert.equal(result.session.nextNodeId, "primitives");
  assert.equal(result.session.status, "in-progress");
});

test("advanceSession returns the same reference when nothing changes", () => {
  const once = advanceSession(planned({ nodes: ["a", "b"], edges: [] }, { a: "passed" }), T2);
  assert.equal(advanceSession(once, T2), once);
});

test("advanceSession is a no-op when there is no session row yet", () => {
  const tl = emptyTopicLedger();
  assert.equal(advanceSession(tl, T1), tl);
});

test("advanceSession is a no-op when the session has no dependencyMap yet", () => {
  const tl = touchSession(emptyTopicLedger(), T1);
  assert.equal(advanceSession(tl, T2), tl);
});

test("deriveSession skips nodes passed in an earlier session at the start of a plan", () => {
  const tl = planned({ nodes: ["a", "b", "c"], edges: [] }, { a: "passed" });
  const derived = deriveSession(tl);
  assert.equal(derived.nextNodeId, "b");
  assert.equal(derived.status, "in-progress");
});

test("deriveSession points at the first node when only a later node is passed", () => {
  const derived = deriveSession(planned({ nodes: ["a", "b", "c"], edges: [] }, { b: "passed" }));
  assert.equal(derived.nextNodeId, "a");
  assert.equal(derived.status, "in-progress");
});

test("deriveSession reports complete with a null frontier when every plan node is passed", () => {
  const derived = deriveSession(planned({ nodes: ["a", "b"], edges: [] }, { a: "passed", b: "passed" }));
  assert.equal(derived.nextNodeId, null);
  assert.equal(derived.status, "complete");
});

test("deriveSession does not count a seen node as passed, but a record of any kind moves planned to in-progress", () => {
  const derived = deriveSession(planned({ nodes: ["a", "b"], edges: [] }, { a: "seen" }));
  assert.equal(derived.nextNodeId, "a");
  assert.equal(derived.status, "in-progress");
});

test("deriveSession leaves a planned row with no recorded plan node as planned", () => {
  const tl = planned({ nodes: ["a", "b"], edges: [] });
  assert.equal(deriveSession(tl), tl.session);
  assert.equal(tl.session.status, "planned");
});

test("deriveSession keeps an empty plan as planned with a null frontier, never complete", () => {
  const tl = planned({ nodes: [], edges: [] });
  const derived = deriveSession(tl);
  assert.equal(derived.status, "planned");
  assert.equal(derived.nextNodeId, null);
});

test("deriveSession ignores plan nodes that are not strings", () => {
  const tl = planned({ nodes: ["a", 2, null, "b"], edges: [] }, { a: "passed" });
  assert.equal(deriveSession(tl).nextNodeId, "b");
});

test("deriveSession moves a complete session back to in-progress when a plan node is no longer passed", () => {
  const tl = planned({ nodes: ["a", "b"], edges: [] }, { a: "passed", b: "passed" });
  const complete = advanceSession(tl, T2);
  assert.equal(complete.session.status, "complete");
  const regressed = recordNode(complete, "b", "failed", T2);
  const derived = deriveSession(regressed);
  assert.equal(derived.status, "in-progress");
  assert.equal(derived.nextNodeId, "b");
});

test("deriveSession returns null with no session and the row itself when there is no dependencyMap", () => {
  assert.equal(deriveSession(emptyTopicLedger()), null);
  const tl = touchSession(emptyTopicLedger(), T1);
  assert.equal(deriveSession(tl), tl.session);
});

test("deriveSession repairs a row written before this change, whose nextNodeId is stuck", () => {
  let tl = planned({ nodes: ["a", "b", "c"], edges: [] }, { a: "passed", b: "passed" });
  tl = { ...tl, session: { ...tl.session, status: "in-progress", nextNodeId: "a" } };
  assert.equal(deriveSession(tl).nextNodeId, "c");
});

test("deriveSession does not mutate its input", () => {
  const tl = planned({ nodes: ["a", "b"], edges: [] }, { a: "passed" });
  const snapshot = JSON.stringify(tl);
  deriveSession(tl);
  assert.equal(JSON.stringify(tl), snapshot);
});

test("setSessionPlan skips nodes that were already passed in an earlier session", () => {
  let tl = recordNode(emptyTopicLedger(), "a", "passed", T1);
  tl = setSessionPlan(tl, { nodes: ["a", "b"], edges: [["a", "b"]] }, T2);
  assert.equal(tl.session.nextNodeId, "b");
  assert.equal(tl.session.status, "in-progress");
});

test("CLI get-session derives the frontier on read for an old row and does not write the ledger", () => {
  const configDir = freshConfigDir();
  let old = planned({ nodes: ["a", "b", "c"], edges: [] }, { a: "passed", b: "passed" });
  old = { ...old, session: { ...old.session, status: "in-progress", nextNodeId: "a" } };
  withConfigDir(configDir, () => writeTopicLedger("javascript", old));
  const file = join(configDir, "sensei", "ledgers", "javascript.json");
  const before = readFileSync(file, "utf8");
  const env = { ...process.env, CLAUDE_CONFIG_DIR: configDir };
  const parsed = JSON.parse(execFileSync("node", [SCRIPT, "get-session", "JavaScript"], { env }).toString());
  assert.equal(parsed.nextNodeId, "c");
  assert.equal(readFileSync(file, "utf8"), before, "reading must not rewrite the ledger");
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

test("readTopicLedger preserves a corrupt file as a backup instead of losing it on the next write", () => {
  const configDir = freshConfigDir();
  withConfigDir(configDir, () => {
    const path = topicLedgerPath("javascript");
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, "{ not valid json", "utf8");

    const originalError = console.error;
    let stderrOutput = "";
    console.error = (msg) => { stderrOutput += msg; };
    let result;
    try {
      result = readTopicLedger("javascript");
    } finally {
      console.error = originalError;
    }

    // The corrupt original must not still be at `path` — otherwise a
    // subsequent writeTopicLedger() would silently overwrite it and the
    // data would be unrecoverable.
    assert.equal(existsSync(path), false);

    const backupMatch = stderrOutput.match(/original preserved at (\S+\.bak)/);
    assert.ok(backupMatch, `expected a backup path in the warning, got: ${stderrOutput}`);
    const backupPath = backupMatch[1];
    assert.equal(readFileSync(backupPath, "utf8"), "{ not valid json");

    // Writing after the corrupt read must not touch the backup.
    writeTopicLedger("javascript", recordNode(result, "foo", "seen"));
    assert.equal(readFileSync(backupPath, "utf8"), "{ not valid json");
  });
});

test("readTopicLedger backs up and discards a ledger with a mismatched version", () => {
  const configDir = freshConfigDir();
  withConfigDir(configDir, () => {
    const path = topicLedgerPath("javascript");
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ version: 2, nodes: {}, session: null }), "utf8");

    const originalError = console.error;
    let stderrOutput = "";
    console.error = (msg) => { stderrOutput += msg; };
    let result;
    try {
      result = readTopicLedger("javascript");
    } finally {
      console.error = originalError;
    }

    assert.deepEqual(result, emptyTopicLedger());
    assert.equal(existsSync(path), false);
    const backupMatch = stderrOutput.match(/original preserved at (\S+\.bak)/);
    assert.ok(backupMatch, `expected a backup path in the warning, got: ${stderrOutput}`);
    assert.match(readFileSync(backupMatch[1], "utf8"), /"version":\s*2/);
  });
});

test("readTopicLedger backs up and discards a ledger with no version field at all", () => {
  const configDir = freshConfigDir();
  withConfigDir(configDir, () => {
    const path = topicLedgerPath("javascript");
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ nodes: {}, session: null }), "utf8");
    const result = readTopicLedger("javascript");
    assert.deepEqual(result, emptyTopicLedger());
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

test("ledgersDir throws a labeled error, not a raw TypeError, when CLAUDE_CONFIG_DIR and HOME are both unset", () => {
  const originalConfigDir = process.env.CLAUDE_CONFIG_DIR;
  const originalHome = process.env.HOME;
  delete process.env.CLAUDE_CONFIG_DIR;
  delete process.env.HOME;
  try {
    assert.throws(() => ledgersDir(), /mastery\.mjs: cannot determine config directory/);
  } finally {
    if (originalConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = originalConfigDir;
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
  }
});

function cliGetSession(configDir) {
  const env = { ...process.env, CLAUDE_CONFIG_DIR: configDir };
  return JSON.parse(execFileSync("node", [SCRIPT, "get-session", "JavaScript"], { env }).toString());
}

function ledgerWithProbes(status) {
  let tl = addProbe(emptyTopicLedger(), { question: "Q", answer: "A", result: "passed" }, T1);
  tl = setSessionGoal(tl, "learn closures", T1);
  if (status !== "intake") {
    tl = setSessionPlan(tl, { nodes: ["a", "b"], edges: [] }, T1);
    if (status === "in-progress") tl = recordNode(tl, "a", "failed", T1);
    if (status === "complete") tl = recordNode(recordNode(tl, "a", "passed", T1), "b", "passed", T1);
  }
  return tl;
}

function intakeLedgerWithStrands() {
  let tl = setSessionGoal(emptyTopicLedger(), "jammy yolk and easy peeling", T1);
  tl = addProbe(tl, { question: "Q1", answer: "A", result: "passed", strand: "heat" }, T1);
  tl = addProbe(tl, { question: "Q2", answer: "B", result: "failed", strand: "heat" }, T1);
  tl = addProbe(tl, { question: "Q3", answer: "A", result: "passed", strand: "peeling" }, T1);
  tl = addProbe(tl, { question: "Q4", answer: "A", result: "passed" }, T1);
  return tl;
}

test("CLI get-session prints the probe log for an intake row", () => {
  const configDir = freshConfigDir();
  withConfigDir(configDir, () => writeTopicLedger("javascript", ledgerWithProbes("intake")));
  const printed = cliGetSession(configDir);
  assert.equal(printed.status, "intake");
  assert.equal(printed.probes.length, 1);
});

test("CLI get-session prints strands and unassigned for an intake row, and does not rewrite the ledger", () => {
  const configDir = freshConfigDir();
  withConfigDir(configDir, () => writeTopicLedger("javascript", intakeLedgerWithStrands()));
  const file = join(configDir, "sensei", "ledgers", "javascript.json");
  const before = readFileSync(file, "utf8");
  const printed = cliGetSession(configDir);
  assert.equal(printed.status, "intake");
  assert.equal(printed.probes.length, 4);
  assert.deepEqual(printed.strands, [
    { name: "heat", passed: 1, failed: 1, bracketed: true },
    { name: "peeling", passed: 1, failed: 0, bracketed: false },
  ]);
  assert.equal(printed.unassigned, 1);
  assert.equal(readFileSync(file, "utf8"), before);
});

test("CLI get-session prints an empty strand summary for an intake row with no probes", () => {
  const configDir = freshConfigDir();
  withConfigDir(configDir, () => writeTopicLedger("javascript", setSessionGoal(emptyTopicLedger(), "learn closures", T1)));
  const printed = cliGetSession(configDir);
  assert.deepEqual(printed.strands, []);
  assert.equal(printed.unassigned, 0);
});

for (const status of ["planned", "in-progress", "complete"]) {
  test(`CLI get-session omits the probe log for a ${status} row, and does not rewrite the ledger`, () => {
    const configDir = freshConfigDir();
    withConfigDir(configDir, () => writeTopicLedger("javascript", ledgerWithProbes(status)));
    const file = join(configDir, "sensei", "ledgers", "javascript.json");
    const before = readFileSync(file, "utf8");
    const printed = cliGetSession(configDir);
    assert.equal(printed.status, status);
    assert.equal("probes" in printed, false);
    assert.equal("strands" in printed, false);
    assert.equal("unassigned" in printed, false);
    assert.equal(printed.goal, "learn closures");
    assert.equal(readFileSync(file, "utf8"), before);
    assert.equal(JSON.parse(before).session.probes.length, 1, "the stored row keeps its probes");
  });
}

test("CLI get-session does not throw on an intake row whose probes value is malformed", () => {
  const configDir = freshConfigDir();
  let tl = touchSession(emptyTopicLedger(), T1);
  tl = { ...tl, session: { ...tl.session, probes: "not an array" } };
  withConfigDir(configDir, () => writeTopicLedger("javascript", tl));
  const printed = cliGetSession(configDir);
  assert.equal(printed.status, "intake");
  assert.deepEqual(printed.strands, []);
  assert.equal(printed.unassigned, 0);
});

test("normalizeStrand trims, lowercases and collapses inner whitespace", () => {
  assert.equal(normalizeStrand("  Heat   Time "), "heat time");
  assert.equal(normalizeStrand("peeling"), "peeling");
});

test("normalizeStrand returns undefined for anything that is not a non-blank string", () => {
  for (const value of [undefined, null, 4, ["heat"], {}, "", "   ", "\t\n", "\u200b", "\u200b\u200c\ufeff"]) {
    assert.equal(normalizeStrand(value), undefined, String(value));
  }
});

test("normalizeStrand drops zero-width characters, also inside a label", () => {
  assert.equal(normalizeStrand("\u200b heat \ufeff"), "heat");
  assert.equal(normalizeStrand("he\u200bat"), "heat");
});

test("normalizeStrand cuts a long label to 60 characters and trims the end of the cut", () => {
  assert.equal(normalizeStrand("a".repeat(100)).length, 60);
  assert.equal(normalizeStrand("a".repeat(59) + " b"), "a".repeat(59));
});

test("normalizeStrand cuts by code point, so a character past the BMP is kept whole or dropped whole", () => {
  assert.equal(normalizeStrand("a".repeat(59) + "\u{1F600}b"), "a".repeat(59) + "\u{1F600}");
  assert.equal(normalizeStrand("a".repeat(60) + "\u{1F600}"), "a".repeat(60));
  assert.doesNotMatch(normalizeStrand("a".repeat(59) + "\u{1F600}b"), /[\ud800-\udbff](?![\udc00-\udfff])/);
});

test("summarizeStrands counts passed and failed per strand and flags a strand only when it has both", () => {
  const probes = [
    { result: "passed", strand: "heat" },
    { result: "failed", strand: "heat" },
    { result: "passed", strand: "peeling" },
    { result: "passed", strand: "peeling" },
  ];
  assert.deepEqual(summarizeStrands(probes), {
    strands: [
      { name: "heat", passed: 1, failed: 1, bracketed: true },
      { name: "peeling", passed: 2, failed: 0, bracketed: false },
    ],
    unassigned: 0,
  });
});

test("summarizeStrands groups names that differ only by case and spacing, in first-appearance order", () => {
  const probes = [
    { result: "failed", strand: "Heat" },
    { result: "passed", strand: " heat " },
    { result: "passed", strand: "peeling" },
  ];
  assert.deepEqual(summarizeStrands(probes).strands, [
    { name: "heat", passed: 1, failed: 1, bracketed: true },
    { name: "peeling", passed: 1, failed: 0, bracketed: false },
  ]);
});

test("summarizeStrands counts a probe with no usable strand as unassigned and lists no strand for it", () => {
  const probes = [{ result: "passed" }, { result: "failed", strand: "" }, { result: "failed", strand: "   " }, { result: "passed", strand: 7 }, null, "junk"];
  assert.deepEqual(summarizeStrands(probes), { strands: [], unassigned: 6 });
});

test("summarizeStrands lists a strand whose probe has no result and counts it as neither passed nor failed", () => {
  assert.deepEqual(summarizeStrands([{ strand: "heat" }]), {
    strands: [{ name: "heat", passed: 0, failed: 0, bracketed: false }],
    unassigned: 0,
  });
});

test("summarizeStrands treats names that exist on Object.prototype as ordinary strand names", () => {
  const probes = [{ result: "passed", strand: "__proto__" }, { result: "failed", strand: "constructor" }];
  assert.deepEqual(summarizeStrands(probes).strands, [
    { name: "__proto__", passed: 1, failed: 0, bracketed: false },
    { name: "constructor", passed: 0, failed: 1, bracketed: false },
  ]);
});

test("summarizeStrands returns an empty summary for missing or malformed probes", () => {
  for (const probes of [undefined, null, "x", 42, {}]) {
    assert.deepEqual(summarizeStrands(probes), { strands: [], unassigned: 0 }, String(probes));
  }
});

function addProbes(tl, count, entry) {
  for (let i = 0; i < count; i++) tl = addProbe(tl, { question: `Q${i}`, answer: "A", ...entry }, T1);
  return tl;
}

function bracketedLedgerThenEvicted() {
  let tl = addProbe(emptyTopicLedger(), { question: "Q", answer: "A", result: "passed", strand: "heat" }, T1);
  tl = addProbe(tl, { question: "Q", answer: "B", result: "failed", strand: "heat" }, T1);
  return addProbes(tl, 19, { result: "passed", strand: "peeling" });
}

test("a strand stays bracketed after its probes are evicted from the 20-entry log", () => {
  const { probes, foldedStrands } = bracketedLedgerThenEvicted().session;
  assert.equal(probes.length, 20);
  assert.deepEqual(summarizeStrands(probes, foldedStrands).strands, [
    { name: "heat", passed: 1, failed: 1, bracketed: true },
    { name: "peeling", passed: 19, failed: 0, bracketed: false },
  ]);
});

test("addProbe keeps nothing in foldedStrands while the log is not over the cap", () => {
  const tl = addProbes(emptyTopicLedger(), 20, { result: "passed", strand: "heat" });
  assert.equal(tl.session.probes.length, 20);
  assert.equal("foldedStrands" in tl.session, false);
});

test("addProbe adds the counts of folded and logged probes of one name", () => {
  let tl = addProbes(emptyTopicLedger(), 21, { result: "failed", strand: "Heat " });
  tl = addProbe(tl, { question: "Q", answer: "A", result: "passed", strand: "heat" }, T1);
  const { probes, foldedStrands } = tl.session;
  assert.deepEqual(summarizeStrands(probes, foldedStrands).strands, [{ name: "heat", passed: 1, failed: 21, bracketed: true }]);
});

test("addProbe drops an evicted probe with no strand, and keeps the name of one with a strand and no result", () => {
  let tl = addProbe(emptyTopicLedger(), { question: "Q", answer: "A", result: "passed" }, T1);
  tl = addProbe(tl, { question: "Q", answer: "A", strand: "heat" }, T1);
  tl = addProbes(tl, 20, { result: "passed", strand: "peeling" });
  assert.deepEqual(tl.session.foldedStrands, [{ name: "heat", passed: 0, failed: 0 }]);
  assert.equal(summarizeStrands(tl.session.probes, tl.session.foldedStrands).unassigned, 0);
});

test("addProbe works on a session row that has no foldedStrands and a full log", () => {
  let tl = addProbes(emptyTopicLedger(), 20, { result: "passed", strand: "heat" });
  tl = { ...tl, session: { ...tl.session } };
  delete tl.session.foldedStrands;
  tl = addProbe(tl, { question: "Q", answer: "A", result: "failed", strand: "heat" }, T1);
  assert.equal(tl.session.probes.length, 20);
  assert.deepEqual(tl.session.foldedStrands, [{ name: "heat", passed: 1, failed: 0 }]);
});

test("summarizeStrands ignores a malformed foldedStrands value and its bad entries", () => {
  const probes = [{ result: "passed", strand: "heat" }];
  const alone = { strands: [{ name: "heat", passed: 1, failed: 0, bracketed: false }], unassigned: 0 };
  for (const folded of [undefined, null, "x", 42, {}]) assert.deepEqual(summarizeStrands(probes, folded), alone, String(folded));
  const bad = [null, "x", { passed: 1, failed: 1 }, { name: "  ", passed: 1, failed: 1 }, { name: "heat", passed: -1, failed: 1.5 }];
  assert.deepEqual(summarizeStrands(probes, bad), alone);
});

test("CLI get-session never prints foldedStrands, but its counts show in strands", () => {
  const configDir = freshConfigDir();
  for (const status of ["intake", "in-progress"]) {
    let tl = bracketedLedgerThenEvicted();
    if (status !== "intake") {
      tl = setSessionGoal(tl, "g", T1);
      tl = setSessionPlan(tl, { nodes: ["a", "b"], edges: [] }, T1);
      tl = recordNode(tl, "a", "failed", T1);
    }
    withConfigDir(configDir, () => writeTopicLedger("javascript", tl));
    const printed = cliGetSession(configDir);
    assert.equal("foldedStrands" in printed, false, status);
    if (status === "intake") assert.equal(printed.strands.find((s) => s.name === "heat").bracketed, true);
  }
});

test("a new goal on a row past intake starts a session row without foldedStrands", () => {
  let tl = bracketedLedgerThenEvicted();
  tl = setSessionPlan(setSessionGoal(tl, "g", T1), { nodes: ["a"], edges: [] }, T1);
  assert.ok(tl.session.foldedStrands);
  tl = setSessionGoal(tl, "something else", T1);
  assert.equal("foldedStrands" in tl.session, false);
});

test("setProposedPlan stores the plan beside the session without approving it", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  const plan = { nodes: ["a", "b"], edges: [["a", "b"]] };
  const base = setSessionGoal(emptyTopicLedger(), "g", now);
  const result = setProposedPlan(base, plan, now);
  assert.deepEqual(result.session.proposedPlan, plan);
  assert.equal(result.session.dependencyMap, null);
  assert.equal(result.session.status, "intake");
  assert.equal(result.session.goal, "g");
  assert.equal(base.session.proposedPlan, undefined, "the input ledger must not be mutated");
});

test("setSessionPlan drops the proposed plan it approves, and a new goal drops it too", () => {
  const plan = { nodes: ["a"], edges: [] };
  const proposed = setProposedPlan(emptyTopicLedger(), plan);
  assert.equal("proposedPlan" in setSessionPlan(proposed, plan).session, false);
  const planned = setSessionPlan(emptyTopicLedger(), plan);
  assert.equal("proposedPlan" in setSessionGoal(setProposedPlan(planned, plan), "new").session, false);
});
