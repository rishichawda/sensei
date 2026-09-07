import { existsSync, readFileSync, writeFileSync, appendFileSync, statSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

export function callout(type, title, bodyLines) {
  const lines = [`> [!${type}] ${title}`];
  for (const line of bodyLines) lines.push(line.length === 0 ? ">" : `> ${line}`);
  return lines.join("\n");
}

export function userBlock(text) {
  return `> [!quote] YOU\n\n${text}`;
}

export function assistantBlock(text) {
  return `> [!abstract] CLAUDE\n\n${text}`;
}

export function questionCallout(label, question, options) {
  const body = question.split("\n");
  if (options.length > 0) {
    body.push("");
    body.push(...options.map((o, i) => `${i + 1}. ${o.label}`));
  }
  return callout("question", label, body);
}

export function answerCallout(answers) {
  const body = answers.length > 0 ? answers : ["(no answer)"];
  return callout("example", "Answer", body);
}

export function cancelledCallout() {
  return callout("warning", "Question — cancelled", ["(dismissed without answering)"]);
}

export function appendToFile(logFile, text) {
  let hasContent = false;
  try {
    hasContent = statSync(logFile).size > 0;
  } catch {
    hasContent = false;
  }
  const prefix = hasContent ? "\n\n" : "";
  appendFileSync(logFile, prefix + text + "\n", "utf8");
}

export function stateFilePathFor(transcriptPath) {
  return transcriptPath.replace(/\.jsonl$/, ".md-log-state.json");
}

export function readState(transcriptPath) {
  const path = stateFilePathFor(transcriptPath);
  if (!existsSync(path)) return { file: null };
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return { file: null };
  }
}

export function writeState(transcriptPath, state) {
  writeFileSync(stateFilePathFor(transcriptPath), JSON.stringify(state), "utf8");
}

// Slash commands don't receive a transcript_path the way hooks do, so this
// resolves the current session the same way a human would: the
// most-recently-modified .jsonl under this project's transcript directory.
// Resolves CLAUDE_CONFIG_DIR (can relocate the whole ~/.claude root) and
// CLAUDE_CODE_PROJECT_DIR_NAME (can override the derived directory name)
// before falling back to defaults, per the spec's Fidelity Note 3.
// Known limitation: if two sessions are active in the same project at once,
// this may pick the wrong one — accepted for a single-user personal tool.
export function findCurrentTranscript() {
  const configRoot = process.env.CLAUDE_CONFIG_DIR || resolve(process.env.HOME, ".claude");
  const projectDirName = process.env.CLAUDE_CODE_PROJECT_DIR_NAME || process.cwd().replace(/[^a-zA-Z0-9]/g, "-");
  const dir = resolve(configRoot, "projects", projectDirName);
  if (!existsSync(dir)) return null;
  const jsonlFiles = readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
  if (jsonlFiles.length === 0) return null;
  const withMtime = jsonlFiles.map((f) => ({ f, mtime: statSync(resolve(dir, f)).mtimeMs }));
  withMtime.sort((a, b) => b.mtime - a.mtime);
  return resolve(dir, withMtime[0].f);
}
