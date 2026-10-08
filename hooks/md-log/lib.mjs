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
// resolves this session's transcript from CLAUDE_CODE_SESSION_ID (set in the
// environment of the Bash tool the command runs through): the file
// <config>/projects/<any project dir>/<session id>.jsonl. Picking the
// newest .jsonl instead would link or unlink another session whenever two
// run in the same project. No session id means no guess: return null.
// CLAUDE_CONFIG_DIR can relocate the whole ~/.claude root.
export function findCurrentTranscript() {
  const sessionId = process.env.CLAUDE_CODE_SESSION_ID;
  if (!sessionId || !/^[A-Za-z0-9_-]+$/.test(sessionId)) return null;
  const configRoot = process.env.CLAUDE_CONFIG_DIR || resolve(process.env.HOME, ".claude");
  const projectsRoot = resolve(configRoot, "projects");
  if (!existsSync(projectsRoot)) return null;
  for (const dir of readdirSync(projectsRoot)) {
    const candidate = resolve(projectsRoot, dir, `${sessionId}.jsonl`);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}
