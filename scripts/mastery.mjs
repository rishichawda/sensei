import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const LEDGER_VERSION = 1;
const PROBE_LOG_MAX = 50;

export function slugify(text) {
  const cleaned = String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "topic";
}

export function ledgersDir() {
  if (!process.env.CLAUDE_CONFIG_DIR && !process.env.HOME) {
    throw new Error("mastery.mjs: cannot determine config directory — set CLAUDE_CONFIG_DIR or HOME");
  }
  const configRoot = process.env.CLAUDE_CONFIG_DIR || resolve(process.env.HOME, ".claude");
  return resolve(configRoot, "sensei", "ledgers");
}

export function topicLedgerPath(topicSlug) {
  return resolve(ledgersDir(), `${topicSlug}.json`);
}

export function emptyTopicLedger() {
  return { version: LEDGER_VERSION, nodes: {}, session: null };
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

// One file per topic: different topics never share a read-modify-write
// window, so a hook writing "javascript" can never silently clobber a
// concurrent write to "powershell-scripting" the way a single shared
// mastery.json could.
export function readTopicLedger(topicSlug) {
  const path = topicLedgerPath(topicSlug);
  if (!existsSync(path)) return emptyTopicLedger();
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    const backupPath = `${path}.corrupt-${Date.now()}-${process.pid}.bak`;
    renameSync(path, backupPath);
    console.error(`mastery.mjs: warning: could not parse ledger at ${path} (starting fresh; original preserved at ${backupPath}): ${err.message}`);
    return emptyTopicLedger();
  }
  if (!isPlainObject(parsed)) {
    console.error(`mastery.mjs: warning: ledger at ${path} has an unrecognized shape (starting fresh)`);
    return emptyTopicLedger();
  }
  const nodes = isPlainObject(parsed.nodes) ? parsed.nodes : {};
  const session = parsed.session === null || isPlainObject(parsed.session) ? parsed.session : null;
  return { ...parsed, nodes, session };
}

export function writeTopicLedger(topicSlug, topicLedger) {
  const path = topicLedgerPath(topicSlug);
  mkdirSync(dirname(path), { recursive: true });
  const tmpPath = `${path}.${process.pid}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(topicLedger), "utf8");
  renameSync(tmpPath, path);
}

export function listTopics() {
  const dir = ledgersDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, -".json".length))
    .sort();
}

export function getTopic(topicLedger) {
  return topicLedger.nodes;
}

export function getSession(topicLedger) {
  return topicLedger.session || null;
}

export function touchSession(topicLedger, now = new Date()) {
  if (topicLedger.session) return topicLedger;
  const session = { goal: null, dependencyMap: null, nextNodeId: null, status: "intake", updatedAt: now.toISOString() };
  return { ...topicLedger, session };
}

export function setSessionGoal(topicLedger, goal, now = new Date()) {
  const base = touchSession(topicLedger, now);
  return { ...base, session: { ...base.session, goal, updatedAt: now.toISOString() } };
}

export function setSessionPlan(topicLedger, plan, now = new Date()) {
  const base = touchSession(topicLedger, now);
  const nodes = Array.isArray(plan?.nodes) ? plan.nodes : [];
  const session = { ...base.session, dependencyMap: plan, nextNodeId: nodes[0] ?? null, status: "planned", updatedAt: now.toISOString() };
  return { ...base, session };
}

export function advanceSession(topicLedger, nodeId, status, now = new Date()) {
  const session = getSession(topicLedger);
  if (!session || !session.dependencyMap) return topicLedger;
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
  if (newStatus === session.status && nextNodeId === session.nextNodeId) return topicLedger;
  return { ...topicLedger, session: { ...session, status: newStatus, nextNodeId, updatedAt: now.toISOString() } };
}

export function recordNode(topicLedger, nodeId, status) {
  const existing = topicLedger.nodes[nodeId];
  if (status === "seen" && existing) return topicLedger;
  const nodes = { ...topicLedger.nodes, [nodeId]: { status, lastTaughtAt: new Date().toISOString() } };
  return { ...topicLedger, nodes };
}

export function addProbe(topicLedger, entry, now = new Date()) {
  const base = touchSession(topicLedger, now);
  const probes = Array.isArray(base.session.probes) ? base.session.probes : [];
  const session = { ...base.session, probes: [...probes, { ...entry, at: now.toISOString() }].slice(-PROBE_LOG_MAX), updatedAt: now.toISOString() };
  return { ...base, session };
}

function main() {
  const [command, topicArg, nodeIdArg, statusArg] = process.argv.slice(2);
  const VALID_STATUSES = ["seen", "passed", "failed"];

  if (command === "get") {
    if (!topicArg) {
      console.error("Usage: mastery.mjs get <topic>");
      process.exit(1);
    }
    console.log(JSON.stringify(getTopic(readTopicLedger(slugify(topicArg)))));
    return;
  }

  if (command === "get-session") {
    if (!topicArg) {
      console.error("Usage: mastery.mjs get-session <topic>");
      process.exit(1);
    }
    console.log(JSON.stringify(getSession(readTopicLedger(slugify(topicArg)))));
    return;
  }

  if (command === "topics") {
    console.log(JSON.stringify(listTopics()));
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
    const topicLedger = readTopicLedger(topicSlug);
    const existingStatus = (getTopic(topicLedger)[nodeSlug] || {}).status;
    const updated = recordNode(topicLedger, nodeSlug, statusArg);
    if (updated === topicLedger) {
      console.log(`unchanged: ${topicSlug} ${nodeSlug} already ${existingStatus}`);
      return;
    }
    writeTopicLedger(topicSlug, updated);
    console.log(`recorded: ${topicSlug} ${nodeSlug} -> ${statusArg}`);
    return;
  }

  console.error("Usage: mastery.mjs <get|get-session|record|topics> ...");
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
