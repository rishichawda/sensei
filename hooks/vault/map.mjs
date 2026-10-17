import { displayName, labelOf } from "./graph.mjs";
import { noteName, topicFolder } from "./paths.mjs";

const KEEP_MAP = "<!-- sensei: do not rename this file or change the sensei-owned line; sensei rewrites this note whenever the plan changes, so edits here are lost. -->";

// The one note sensei may overwrite: it holds no flashcards, so rewriting it
// cannot erase review history. `sensei-owned: true` is the writer's proof.
export function mapNoteText({ topic, goal, plan }) {
  const nodes = Array.isArray(plan?.nodes) ? plan.nodes : [];
  const edges = Array.isArray(plan?.edges) ? plan.edges : [];
  const index = new Map(nodes.map((id, i) => [id, i]));
  const graph = [
    "graph TD",
    ...nodes.map((id, i) => `  n${i}["${labelOf(plan, id).replace(/"/g, "#quot;")}"]`),
    ...edges
      .filter((e) => Array.isArray(e) && index.has(e[0]) && index.has(e[1]))
      .map((e) => `  n${index.get(e[0])} --> n${index.get(e[1])}`),
  ];
  const front = ["---", "sensei-owned: true", `topic: ${topic}`];
  if (goal) front.push(`goal: ${JSON.stringify(String(goal))}`);
  front.push("---");
  const names = nodes.map((id) => noteName(labelOf(plan, id))).filter((name) => name !== null);
  const links = names.map((name) => `- [[sensei/${topicFolder(topic)}/${name}|${name}]]`);
  return [
    ...front,
    KEEP_MAP,
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
