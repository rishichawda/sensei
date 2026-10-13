import { displayName } from "./graph.mjs";

// The one note sensei may overwrite: it holds no flashcards, so rewriting it
// cannot erase review history. `sensei-owned: true` is the writer's proof.
export function mapNoteText({ topic, goal, plan }) {
  const nodes = Array.isArray(plan?.nodes) ? plan.nodes : [];
  const edges = Array.isArray(plan?.edges) ? plan.edges : [];
  const index = new Map(nodes.map((id, i) => [id, i]));
  const graph = [
    "graph TD",
    ...nodes.map((id, i) => `  n${i}["${displayName(id)}"]`),
    ...edges
      .filter((e) => Array.isArray(e) && index.has(e[0]) && index.has(e[1]))
      .map((e) => `  n${index.get(e[0])} --> n${index.get(e[1])}`),
  ];
  const front = ["---", "sensei-owned: true", `topic: ${topic}`];
  if (goal) front.push(`goal: ${JSON.stringify(String(goal))}`);
  front.push("---");
  const links = nodes.map((id) => `- [[sensei/${topic}/${id}|${id}]]`);
  return [
    ...front,
    `# ${displayName(topic)}`,
    ...(goal ? ["", String(goal)] : []),
    "",
    "```mermaid",
    ...graph,
    "```",
    "",
    "## Concepts",
    ...links,
    "",
  ].join("\n");
}
