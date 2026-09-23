import { appendToFile, userBlock, assistantBlock, readState, writeState } from "./lib.mjs";
import { handlePreToolUse, handlePostToolUse } from "./ask-user-question.mjs";

// Simplification: backfill/top-up walks the transcript in file order, not by
// following the active branch's parent-chain — for a rewound/branched session
// this may include some abandoned-branch turns. Deliberately deferred: low
// impact for normal single-branch personal use.

function blocksOf(content) {
  if (typeof content === "string") return [{ type: "text", text: content }];
  if (Array.isArray(content)) return content;
  return [];
}

// A transcript entry for an AskUserQuestion tool_result carries the
// structured { questions, answers } shape at the top level (toolUseResult),
// not inside message.content — the same shape the live PostToolUse hook
// receives as tool_response. Reused here instead of re-parsing the
// human-readable tool_result.content string, which isn't a stable format.
function isAskUserQuestionResult(toolUseResult) {
  return !!toolUseResult && Array.isArray(toolUseResult.questions) && !!toolUseResult.answers;
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
    if (entry.isMeta === true) continue;
    const msg = entry?.message;
    if (!msg || (msg.role !== "user" && msg.role !== "assistant")) continue;

    let textBuffer = "";
    const flushText = () => {
      const text = textBuffer.trim();
      if (text) {
        appendToFile(logFile, msg.role === "user" ? userBlock(text) : assistantBlock(text));
        count++;
      }
      textBuffer = "";
    };

    for (const block of blocksOf(msg.content)) {
      if (!block || typeof block !== "object") continue;
      if (block.type === "text" && typeof block.text === "string") {
        textBuffer += (textBuffer ? "\n" : "") + block.text;
      } else if (block.type === "tool_use" && block.name === "AskUserQuestion") {
        flushText();
        const out = handlePreToolUse({ tool_name: "AskUserQuestion", tool_input: block.input || {} });
        if (out) {
          appendToFile(logFile, out);
          count++;
        }
      } else if (block.type === "tool_result" && isAskUserQuestionResult(entry.toolUseResult)) {
        flushText();
        const out = handlePostToolUse({ tool_name: "AskUserQuestion", tool_response: entry.toolUseResult });
        if (out) {
          appendToFile(logFile, out);
          count++;
        }
      }
    }
    flushText();
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
  if (!payload || !payload.transcript_path) return;
  const transcriptPath = payload.transcript_path;
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
