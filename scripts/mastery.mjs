import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

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

export function readLedger() {
  const path = ledgerPath();
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
}

export function writeLedger(ledger) {
  const path = ledgerPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(ledger), "utf8");
}

export function getTopic(ledger, topicSlug) {
  return ledger[topicSlug] || {};
}

export function recordNode(ledger, topicSlug, nodeId, status) {
  const topic = { ...(ledger[topicSlug] || {}) };
  topic[nodeId] = { status, lastTaughtAt: new Date().toISOString() };
  return { ...ledger, [topicSlug]: topic };
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
    const updated = recordNode(readLedger(), topicSlug, nodeSlug, statusArg);
    writeLedger(updated);
    console.log(`recorded: ${topicSlug} ${nodeSlug} -> ${statusArg}`);
    return;
  }

  console.error("Usage: mastery.mjs <get|record> ...");
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
