import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const LEDGER_VERSION = 1;

export function slugify(text) {
  const cleaned = String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "topic";
}

export function ledgerPath() {
  const configRoot = process.env.CLAUDE_CONFIG_DIR || resolve(process.env.HOME, ".claude");
  return resolve(configRoot, "sensei", "mastery.json");
}

export function emptyLedger() {
  return { version: LEDGER_VERSION, topics: {}, sessions: {} };
}

export function readLedger() {
  const path = ledgerPath();
  if (!existsSync(path)) return emptyLedger();
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    console.error(`mastery.mjs: warning: could not parse ledger at ${path} (starting fresh): ${err.message}`);
    return emptyLedger();
  }
  if (!parsed || parsed.topics === null || typeof parsed.topics !== "object") {
    console.error(`mastery.mjs: warning: ledger at ${path} has an unrecognized shape (starting fresh)`);
    return emptyLedger();
  }
  const sessionsValid = parsed.sessions && typeof parsed.sessions === "object" && !Array.isArray(parsed.sessions);
  return { ...parsed, sessions: sessionsValid ? parsed.sessions : {} };
}

export function writeLedger(ledger) {
  const path = ledgerPath();
  mkdirSync(dirname(path), { recursive: true });
  const tmpPath = `${path}.${process.pid}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(ledger), "utf8");
  renameSync(tmpPath, path);
}

export function getTopic(ledger, topicSlug) {
  return ledger.topics[topicSlug] || {};
}

export function getSession(ledger, topicSlug) {
  return ledger.sessions[topicSlug] || null;
}

export function touchSession(ledger, topicSlug, now = new Date()) {
  if (ledger.sessions[topicSlug]) return ledger;
  const row = { goal: null, dependencyMap: null, nextNodeId: null, status: "intake", updatedAt: now.toISOString() };
  return { ...ledger, sessions: { ...ledger.sessions, [topicSlug]: row } };
}

export function setSessionGoal(ledger, topicSlug, goal, now = new Date()) {
  const base = touchSession(ledger, topicSlug, now);
  const session = base.sessions[topicSlug];
  const updated = { ...session, goal, updatedAt: now.toISOString() };
  return { ...base, sessions: { ...base.sessions, [topicSlug]: updated } };
}

export function setSessionPlan(ledger, topicSlug, plan, now = new Date()) {
  const base = touchSession(ledger, topicSlug, now);
  const session = base.sessions[topicSlug];
  const nodes = Array.isArray(plan?.nodes) ? plan.nodes : [];
  const updated = { ...session, dependencyMap: plan, nextNodeId: nodes[0] ?? null, status: "planned", updatedAt: now.toISOString() };
  return { ...base, sessions: { ...base.sessions, [topicSlug]: updated } };
}

export function advanceSession(ledger, topicSlug, nodeId, status, now = new Date()) {
  const session = getSession(ledger, topicSlug);
  if (!session || !session.dependencyMap) return ledger;
  let nextNodeId = session.nextNodeId;
  let newStatus = session.status === "planned" ? "in-progress" : session.status;
  if (status === "passed" && nodeId === session.nextNodeId) {
    const nodes = session.dependencyMap.nodes || [];
    const idx = nodes.indexOf(nodeId);
    const following = idx >= 0 ? nodes[idx + 1] : undefined;
    if (following !== undefined) {
      nextNodeId = following;
    } else {
      nextNodeId = null;
      newStatus = "complete";
    }
  }
  if (newStatus === session.status && nextNodeId === session.nextNodeId) return ledger;
  const updated = { ...session, status: newStatus, nextNodeId, updatedAt: now.toISOString() };
  return { ...ledger, sessions: { ...ledger.sessions, [topicSlug]: updated } };
}

export function listTopics(ledger) {
  return Object.keys(ledger.topics).sort();
}

export function recordNode(ledger, topicSlug, nodeId, status) {
  const existing = (ledger.topics[topicSlug] || {})[nodeId];
  if (status === "seen" && existing) return ledger;
  const topic = { ...(ledger.topics[topicSlug] || {}) };
  topic[nodeId] = { status, lastTaughtAt: new Date().toISOString() };
  return { ...ledger, topics: { ...ledger.topics, [topicSlug]: topic } };
}

function main() {
  const [command, topicArg, nodeIdArg, statusArg] = process.argv.slice(2);
  const VALID_STATUSES = ["seen", "passed", "failed"];

  if (command === "get") {
    if (!topicArg) {
      console.error("Usage: mastery.mjs get <topic>");
      process.exit(1);
    }
    const ledger = readLedger();
    console.log(JSON.stringify(getTopic(ledger, slugify(topicArg))));
    return;
  }

  if (command === "get-session") {
    if (!topicArg) {
      console.error("Usage: mastery.mjs get-session <topic>");
      process.exit(1);
    }
    const ledger = readLedger();
    console.log(JSON.stringify(getSession(ledger, slugify(topicArg))));
    return;
  }

  if (command === "topics") {
    console.log(JSON.stringify(listTopics(readLedger())));
    return;
  }

  if (command === "record") {
    if (!topicArg || !nodeIdArg || !statusArg) {
      console.error("Usage: mastery.mjs record <topic> <node-id> <seen|passed|failed>");
      process.exit(1);
    }
    if (!VALID_STATUSES.includes(statusArg)) {
      console.error(`mastery.mjs: invalid status "${statusArg}" — must be one of ${VALID_STATUSES.join(", ")}`);
      process.exit(1);
    }
    const topicSlug = slugify(topicArg);
    const nodeSlug = slugify(nodeIdArg);
    const ledger = readLedger();
    const existingStatus = (getTopic(ledger, topicSlug)[nodeSlug] || {}).status;
    const updated = recordNode(ledger, topicSlug, nodeSlug, statusArg);
    if (updated === ledger) {
      console.log(`unchanged: ${topicSlug} ${nodeSlug} already ${existingStatus}`);
      return;
    }
    writeLedger(updated);
    console.log(`recorded: ${topicSlug} ${nodeSlug} -> ${statusArg}`);
    return;
  }

  console.error("Usage: mastery.mjs <get|get-session|record|topics> ...");
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
