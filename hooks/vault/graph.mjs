// No imports: the Claude Code mod imports this file, and a mod has no Node.

export function displayName(slug) {
  return String(slug).replace(/-+/g, " ").trim();
}

// What the learner reads for a step: the plain-words label the plan carries. A plan is
// only stored with a label for every step (validatePlan).
export function labelOf(plan, id) {
  const label = plan?.labels?.[id];
  return typeof label === "string" ? label : "";
}

// Edges are [prerequisite, dependent] pairs.
export function prerequisitesOf(plan, node) {
  const edges = Array.isArray(plan?.edges) ? plan.edges : [];
  return edges
    .filter((edge) => Array.isArray(edge) && edge[1] === node && typeof edge[0] === "string")
    .map((edge) => edge[0]);
}
