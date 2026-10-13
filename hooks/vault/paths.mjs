import { resolve, sep } from "node:path";

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

export function nodeFile(root, topic, node) {
  return confined(root, requireSlug("topic", topic), `${requireSlug("node", node)}.md`);
}

export function mapFile(root, topic) {
  return confined(root, requireSlug("topic", topic), "_map.md");
}
