// Imported by the Claude Code mod, which has no Node: import only other plain
// plugin files, never a `node:` module.
import { labelOf, prerequisitesOf } from "../vault/graph.mjs";

// The ledger is a file the learner may have edited: a plan counts only when its nodes
// are an array, and a goal only when it is text.
const wellFormed = (candidate) => (Array.isArray(candidate?.nodes) ? candidate : null);
const plan = (ledger) => wellFormed(ledger?.session?.dependencyMap);

// A plan the learner has been shown but has not approved yet (set before approval,
// removed by it).
export function proposedPlan(ledger) {
  return wellFormed(ledger?.session?.proposedPlan);
}

export function goalOf(ledger) {
  const goal = ledger?.session?.goal;
  return typeof goal === "string" && goal !== "" ? goal : null;
}

export const drawnPlan = (ledger) => plan(ledger) ?? proposedPlan(ledger);
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

export function chipLabel(ledger, id) {
  return `${glyph(ledger, id)} ${labelOf(drawnPlan(ledger), id)}`;
}

// The step passed most recently. A batched check passes several at one instant, so a
// tie goes to the later step in the plan.
function lastPassed(ledger) {
  let best = null;
  let bestAt = "";
  for (const id of plan(ledger)?.nodes ?? []) {
    if (statusOf(ledger, id) !== "passed") continue;
    const at = ledger.nodes[id].lastTaughtAt ?? "";
    if (best === null || at >= bestAt) [best, bestAt] = [id, at];
  }
  return best === null ? null : labelOf(plan(ledger), best);
}

const line = (glyph, head, tone, { detail = null, last = null, animated = false } = {}) => ({ glyph, head, tone, detail, last, animated });

// What the band above the prompt says, from the ledger alone, so it never shows a stale result.
// `head` is the state, drawn in `tone` after its glyph; `detail` (the goal) and `last` are drawn
// plain. Glyph and colour follow the plan: ◌ planning (animated, plain), ◇ proposed (yellow, waiting
// for the learner), ● in progress (cyan), ✗ retry (red), ✓ done (green). An approved plan is in
// progress at once: teaching starts when it is approved, long before the first check is recorded.
export function bandLine(ledger) {
  const session = ledger?.session;
  if (!session) return null;
  const { passed, total } = progress(ledger);
  const proposed = proposedPlan(ledger);
  if (session.status === "intake" && proposed) return line("◇", `Plan proposed · ${proposed.nodes.length} steps`, "yellow", { detail: goalOf(ledger) });
  if (session.status === "intake") return goalOf(ledger) ? line("◌", "Planning", undefined, { detail: goalOf(ledger), animated: true }) : null;
  if (session.status === "complete") return line("✓", `All ${total} steps passed`, "green");
  if ((session.status === "planned" || session.status === "in-progress") && session.nextNodeId) {
    const retry = statusOf(ledger, session.nextNodeId) === "failed";
    const head = `Step ${passed + 1} of ${total} · ${retry ? "Retry" : "In progress"}: ${labelOf(plan(ledger), session.nextNodeId)}`;
    return line(retry ? "✗" : "●", head, retry ? "red" : "cyan", { last: lastPassed(ledger) });
  }
  return null;
}

export function snapshot(topic, ledger) {
  if (!ledger) return null;
  const statuses = {};
  const names = {};
  for (const [id, node] of Object.entries(ledger.nodes ?? {})) {
    statuses[id] = node?.status ?? "";
    names[id] = labelOf(drawnPlan(ledger), id);
  }
  return { topic, statuses, names, next: ledger.session?.nextNodeId ?? null, sessionStatus: ledger.session?.status ?? null };
}

export function changedStatuses(previous, current) {
  const toasts = [];
  if (!previous || !current || previous.topic !== current.topic) return toasts;
  for (const [id, status] of Object.entries(current.statuses)) {
    if (previous.statuses[id] === status) continue;
    if (status === "passed") toasts.push(`✓ ${current.names[id]}`);
    else if (status === "failed") toasts.push(`✗ ${current.names[id]} — retry`);
  }
  return toasts;
}

export function nodeDetail(ledger, id) {
  const shown = drawnPlan(ledger);
  const edges = Array.isArray(shown?.edges) ? shown.edges : [];
  const taught = ledger?.nodes?.[id]?.lastTaughtAt;
  return {
    name: labelOf(shown, id),
    status: plan(ledger) ? stateOf(ledger, id) : "proposed",
    prerequisites: prerequisitesOf(shown, id).map((p) => labelOf(shown, p)),
    dependents: edges.filter((e) => Array.isArray(e) && e[0] === id).map((e) => labelOf(shown, e[1])),
    taught: typeof taught === "string" ? taught.slice(0, 10) : null,
  };
}
