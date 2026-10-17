import { resolve, sep } from "node:path";
import { displayName } from "./graph.mjs";

const SLUG = /^[a-z0-9][a-z0-9-]*$/;

export function isSlug(value) {
  return typeof value === "string" && SLUG.test(value);
}

// <vault>/sensei, or null when no vault path is configured. Whether the
// directory exists is the writer's check.
export function vaultRoot(vaultPath) {
  if (typeof vaultPath !== "string" || vaultPath.trim() === "") return null;
  return resolve(vaultPath.trim(), "sensei");
}

function requireSlug(kind, value) {
  if (!isSlug(value)) throw new Error(`vault: invalid ${kind} slug ${JSON.stringify(value)}`);
  return value;
}

function confined(root, ...parts) {
  const path = resolve(root, ...parts);
  if (path !== root && !path.startsWith(root + sep)) throw new Error(`vault: path escapes ${root}: ${path}`);
  return path;
}

// What a step's label becomes as a note name: characters that break a path or a wikilink
// turn into spaces, whitespace is squeezed, leading dots go. Null when nothing usable is
// left, or when the name would be the map note's.
export function noteName(label) {
  const name = String(label ?? "")
    .replace(/[\\/:*?"<>|#^\[\]\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.\s]+/, "")
    .slice(0, 100)
    .trim();
  return name === "" || name.toLowerCase() === "_map" ? null : name;
}

// The topic folder is the slug in words, so the learner reads "camera lens cleaning".
export function topicFolder(topic) {
  return displayName(requireSlug("topic", topic));
}

export function topicDir(root, topic) {
  return confined(root, topicFolder(topic));
}

export function nodeFile(root, topic, name) {
  if (noteName(name) !== name) throw new Error(`vault: invalid note name ${JSON.stringify(name)}`);
  return confined(topicDir(root, topic), `${name}.md`);
}

export function mapFile(root, topic) {
  return confined(topicDir(root, topic), "_map.md");
}
