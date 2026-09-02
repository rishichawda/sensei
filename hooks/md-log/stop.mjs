import { readFileSync, existsSync } from "node:fs";
import { appendToFile, assistantBlock, readState, writeState } from "./lib.mjs";

function textOf(content) {
  if (!Array.isArray(content)) return "";
  return content.filter((c) => c.type === "text").map((c) => c.text).join("\n");
}

export function handleStop({ lines, sinceLine }) {
  const newLines = lines.slice(sinceLine);
  const blocks = [];
  for (const raw of newLines) {
    let entry;
    try {
      entry = JSON.parse(raw);
    } catch {
      continue;
    }
    if (entry?.message?.role !== "assistant") continue;
    const text = textOf(entry.message.content).trim();
    if (text) blocks.push(text);
  }
  if (blocks.length === 0) return null;
  return assistantBlock(blocks.join("\n\n"));
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
  if (!payload || !payload.transcript_path) return;

  const state = readState(payload.transcript_path);
  if (!state.file) return;
  if (!existsSync(payload.transcript_path)) return;

  const lines = readFileSync(payload.transcript_path, "utf8").trim().split("\n");
  const sinceLine = state.lastLine ?? 0;
  const block = handleStop({ lines, sinceLine });
  if (block) appendToFile(state.file, block);

  writeState(payload.transcript_path, { ...state, lastLine: lines.length });
}

if (import.meta.url === `file://${process.argv[1]}`) main();
