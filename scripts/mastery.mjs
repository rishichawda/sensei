import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const LEDGER_VERSION = 1;
const PROBE_LOG_MAX = 20;
const STRAND_NAME_MAX = 60;

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
  if (parsed.version !== LEDGER_VERSION) {
    const backupPath = `${path}.corrupt-${Date.now()}-${process.pid}.bak`;
    renameSync(path, backupPath);
    console.error(`mastery.mjs: warning: ledger at ${path} has an incompatible version ${parsed.version} (starting fresh; original preserved at ${backupPath})`);
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

// A goal event on a session that is already past intake means the learner
// wants something else: start a fresh session row (per-node mastery is kept)
// so the old plan and status can neither hide the new goal nor resume it.
export function setSessionGoal(topicLedger, goal, now = new Date()) {
  const session = getSession(topicLedger);
  if (session && session.status !== "intake") {
    return {
      ...topicLedger,
      session: { goal, dependencyMap: null, nextNodeId: null, status: "intake", updatedAt: now.toISOString() },
    };
  }
  const base = touchSession(topicLedger, now);
  return { ...base, session: { ...base.session, goal, updatedAt: now.toISOString() } };
}

// The frontier and status are facts about the ledger, not bookkeeping: the
// frontier is the first plan node that is not `passed`, so nodes covered in an
// earlier session or passed out of order can never strand it.
export function deriveSession(topicLedger) {
  const session = getSession(topicLedger);
  const planNodes = session?.dependencyMap?.nodes;
  if (!session || !Array.isArray(planNodes)) return session;
  const ids = planNodes.filter((id) => typeof id === "string");
  const recorded = topicLedger.nodes ?? {};
  const frontier = ids.find((id) => recorded[id]?.status !== "passed") ?? null;
  let status = session.status;
  if (frontier === null) {
    if (ids.length > 0) status = "complete";
  } else if (status === "planned") {
    if (ids.some((id) => recorded[id])) status = "in-progress";
  } else if (status === "complete") {
    status = "in-progress";
  }
  if (frontier === session.nextNodeId && status === session.status) return session;
  return { ...session, nextNodeId: frontier, status };
}

function applyDerived(topicLedger, now) {
  const derived = deriveSession(topicLedger);
  if (!derived || derived === topicLedger.session) return topicLedger;
  return { ...topicLedger, session: { ...derived, updatedAt: now.toISOString() } };
}

export function setSessionPlan(topicLedger, plan, now = new Date()) {
  const base = touchSession(topicLedger, now);
  const session = { ...base.session, dependencyMap: plan, nextNodeId: null, status: "planned", updatedAt: now.toISOString() };
  return applyDerived({ ...base, session }, now);
}

export function advanceSession(topicLedger, now = new Date()) {
  return applyDerived(topicLedger, now);
}

export function recordNode(topicLedger, nodeId, status, now = new Date()) {
  const existing = topicLedger.nodes[nodeId];
  if (status === "seen" && existing) return topicLedger;
  const nodes = { ...topicLedger.nodes, [nodeId]: { status, lastTaughtAt: now.toISOString() } };
  return { ...topicLedger, nodes };
}

export function addProbe(topicLedger, entry, now = new Date()) {
  const base = touchSession(topicLedger, now);
  const probes = Array.isArray(base.session.probes) ? base.session.probes : [];
  const session = { ...base.session, probes: [...probes, { ...entry, at: now.toISOString() }].slice(-PROBE_LOG_MAX), updatedAt: now.toISOString() };
  return { ...base, session };
}

export function normalizeStrand(value) {
  if (typeof value !== "string") return undefined;
  const collapsed = value.replace(/[\u200b-\u200d\ufeff]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
  const name = [...collapsed].slice(0, STRAND_NAME_MAX).join("").trimEnd();
  return name === "" ? undefined : name;
}

// Which strands the probe log has already bracketed (a passed and a failed probe) is a fact
// about the log, so code reads it; the model only reads the result. A Map keeps names such as
// "__proto__" ordinary.
export function summarizeStrands(probes) {
  const byName = new Map();
  let unassigned = 0;
  for (const probe of Array.isArray(probes) ? probes : []) {
    const name = normalizeStrand(probe?.strand);
    if (name === undefined) {
      unassigned += 1;
      continue;
    }
    if (!byName.has(name)) byName.set(name, { name, passed: 0, failed: 0 });
    const counts = byName.get(name);
    if (probe.result === "passed") counts.passed += 1;
    else if (probe.result === "failed") counts.failed += 1;
  }
  const strands = [...byName.values()].map((counts) => ({ ...counts, bracketed: counts.passed >= 1 && counts.failed >= 1 }));
  return { strands, unassigned };
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
    const session = deriveSession(readTopicLedger(slugify(topicArg)));
    if (session && session.status !== "intake") {
      // Resume skips Phase 1 for these rows, so the probe log is only token cost here.
      const { probes, ...withoutProbes } = session;
      console.log(JSON.stringify(withoutProbes));
    } else if (session) {
      console.log(JSON.stringify({ ...session, ...summarizeStrands(session.probes) }));
    } else {
      console.log(JSON.stringify(session));
    }
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
