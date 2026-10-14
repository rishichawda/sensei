// Imported by the Claude Code mod, which has no Node: import only other plain
// plugin files, never a `node:` module.
import { displayName, prerequisitesOf } from "../vault/graph.mjs";

const plan = (ledger) => ledger?.session?.dependencyMap ?? null;
const statusOf = (ledger, id) => ledger?.nodes?.[id]?.status ?? null;

// Row = longest prerequisite chain above the node. A cycle never crashes: the
// nodes that cannot be placed go together in the last row.
export function layers(nodes, edges) {
  const ids = [...new Set(Array.isArray(nodes) ? nodes : [])];
  const known = new Set(ids);
  const preds = new Map(ids.map((id) => [id, []]));
  for (const edge of Array.isArray(edges) ? edges : []) {
    if (!Array.isArray(edge)) continue;
    const [from, to] = edge;
    if (from !== to && known.has(from) && known.has(to) && !preds.get(to).includes(from)) preds.get(to).push(from);
  }
  const rows = [];
  const placed = new Set();
  let remaining = ids;
  while (remaining.length > 0) {
    let ready = remaining.filter((id) => preds.get(id).every((p) => placed.has(p)));
    if (ready.length === 0) ready = remaining;
    rows.push(ready);
    for (const id of ready) placed.add(id);
    remaining = remaining.filter((id) => !placed.has(id));
  }
  return rows;
}

export function progress(ledger) {
  const nodes = plan(ledger)?.nodes ?? [];
  return { passed: nodes.filter((id) => statusOf(ledger, id) === "passed").length, total: nodes.length };
}

// The ledger records only passed and failed; the node being taught has neither yet.
function stateOf(ledger, id) {
  const status = statusOf(ledger, id);
  if (status === "passed" || status === "failed") return status;
  return ledger?.session?.nextNodeId === id ? "in progress" : "not started";
}

const GLYPHS = { passed: "✓", failed: "✗", "in progress": "●", "not started": "○" };

export function glyph(ledger, id) {
  return GLYPHS[stateOf(ledger, id)];
}

export function bandText(ledger) {
  const session = ledger?.session;
  if (!session) return null;
  const { passed, total } = progress(ledger);
  const goal = session.goal ? ` · ${session.goal}` : "";
  if (session.status === "intake") return session.goal ? `Planning · ${session.goal}` : null;
  if (session.status === "planned") return `Plan ready · ${total} steps${goal}`;
  if (session.status === "complete") return `All ${total} steps passed`;
  if (session.status === "in-progress" && session.nextNodeId) {
    const state = statusOf(ledger, session.nextNodeId) === "failed" ? "retry" : "check pending";
    return `Step ${passed + 1} of ${total} · ${displayName(session.nextNodeId)} · ${state}`;
  }
  return null;
}

export function snapshot(topic, ledger) {
  if (!ledger) return null;
  const statuses = {};
  for (const [id, node] of Object.entries(ledger.nodes ?? {})) statuses[id] = node?.status ?? "";
  return { topic, statuses, next: ledger.session?.nextNodeId ?? null, sessionStatus: ledger.session?.status ?? null };
}

export function changedStatuses(previous, current) {
  const toasts = [];
  if (!previous || !current || previous.topic !== current.topic) return toasts;
  for (const [id, status] of Object.entries(current.statuses)) {
    if (previous.statuses[id] === status) continue;
    if (status === "passed") toasts.push(`✓ ${displayName(id)}`);
    else if (status === "failed") toasts.push(`✗ ${displayName(id)} — retry`);
  }
  return toasts;
}

export function nodeDetail(ledger, id) {
  const edges = plan(ledger)?.edges ?? [];
  const taught = ledger?.nodes?.[id]?.lastTaughtAt;
  return {
    name: displayName(id),
    status: stateOf(ledger, id),
    prerequisites: prerequisitesOf(plan(ledger), id).map(displayName),
    dependents: edges.filter((e) => Array.isArray(e) && e[0] === id).map((e) => displayName(e[1])),
    taught: typeof taught === "string" ? taught.slice(0, 10) : null,
  };
}
