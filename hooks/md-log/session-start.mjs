import { appendToFile, userBlock, assistantBlock, readState, writeState } from "./lib.mjs";

// Simplification: backfill/top-up walks the transcript in file order, not by
// following the active branch's parent-chain — for a rewound/branched session
// this may include some abandoned-branch turns. Deliberately deferred: low
// impact for normal single-branch personal use.

function textOf(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.filter((c) => c.type === "text").map((c) => c.text).join("\n");
  }
  return "";
}

export function backfill(transcriptLines, logFile) {
  let count = 0;
  for (const raw of transcriptLines) {
    let entry;
    try {
      entry = JSON.parse(raw);
    } catch {
      continue;
    }
    const msg = entry?.message;
    if (!msg || (msg.role !== "user" && msg.role !== "assistant")) continue;
    const text = textOf(msg.content).trim();
    if (!text) continue;
    appendToFile(logFile, msg.role === "user" ? userBlock(text) : assistantBlock(text));
    count++;
  }
  return count;
}

async function main() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return;
  }
  const transcriptPath = payload.transcript_path;
  if (!transcriptPath) return;
  const state = readState(transcriptPath);
  if (!state.file) return;

  const { readFileSync, existsSync } = await import("node:fs");
  if (!existsSync(transcriptPath)) return;
  const rawText = readFileSync(transcriptPath, "utf8").trim();
  const lines = rawText ? rawText.split("\n") : [];
  const sinceLine = state.lastLine ?? 0;
  backfill(lines.slice(sinceLine), state.file);
  writeState(transcriptPath, { ...state, lastLine: lines.length });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
