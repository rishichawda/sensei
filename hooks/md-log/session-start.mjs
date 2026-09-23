import { appendToFile, userBlock, assistantBlock, readState, writeState } from "./lib.mjs";
import { handlePreToolUse, handlePostToolUse } from "./ask-user-question.mjs";

// backfill/top-up walks the transcript's true root-to-leaf path when the
// lines carry parentUuid links (see reconstructLivePath below), so a
// rewound/branched session's abandoned-branch turns are excluded. Falls back
// to plain file order when no real entry carries a parentUuid at all.

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

// The file itself never marks which branch is live (see plan's probe
// findings). The only reliable reconstruction is: parse every line, classify
// "real" turns the same way the main loop does (message.role user/assistant
// — not entry.type), then walk parentUuid backward from the last real
// non-sidechain entry to the root. Anything sharing a parentUuid with that
// path but not on it (an abandoned branch) is simply never visited.
//
// The parentUuid resolution map is built from EVERY parsed entry, not just
// real ones: per the plan's probe findings, parentUuid exists on every line
// type, and real turns routinely have a bookkeeping line (attachment,
// system, etc.) as their *immediate* parent rather than another real turn —
// confirmed live-fire against session 9a95b2a7 (24 of 61 real entries there
// have a non-real immediate parent). Scoping the map to real entries only
// made the backward walk stop at the first such bookkeeping line, silently
// truncating almost the entire session instead of just excluding the
// abandoned branch. Walking through non-real nodes as transparent pass-through
// fixes this: the walk still only collects real entries into the output, and
// since each node has exactly one parent, the abandoned branch stays
// unreachable regardless of which nodes the map contains.
//
// Backward-compatibility fallback: every pre-existing transcript shape this
// hook has seen carries no uuid/parentUuid at all. If none of the real
// entries in transcriptLines carry a parentUuid, this returns transcriptLines
// unchanged so the existing per-line loop runs exactly as before. This check
// stays scoped to real entries only — widening it to all entries would flip
// fixtures with bookkeeping-only parentUuid fields into reconstruction mode
// for no reason.
function reconstructLivePath(transcriptLines) {
  const parsed = [];
  for (const raw of transcriptLines) {
    let entry;
    try {
      entry = JSON.parse(raw);
    } catch {
      continue;
    }
    parsed.push({ raw, entry });
  }

  const isReal = ({ entry }) => {
    const role = entry?.message?.role;
    return role === "user" || role === "assistant";
  };
  const realEntries = parsed.filter(isReal);

  const hasParentUuid = realEntries.some(({ entry }) => entry.parentUuid != null);
  if (!hasParentUuid) return transcriptLines;

  const byUuid = new Map();
  for (const item of parsed) {
    if (item.entry?.uuid != null) byUuid.set(item.entry.uuid, item);
  }

  let lastReal = null;
  for (const item of realEntries) {
    if (item.entry.isSidechain !== true) lastReal = item;
  }
  if (!lastReal) return transcriptLines;

  const collected = [];
  const visited = new Set();
  let current = lastReal;
  while (current && !visited.has(current)) {
    if (isReal(current)) collected.push(current.raw);
    visited.add(current);
    const parentUuid = current.entry.parentUuid;
    current = parentUuid != null ? byUuid.get(parentUuid) : undefined;
  }
  collected.reverse();
  return collected;
}

export function backfill(transcriptLines, logFile) {
  let count = 0;
  for (const raw of reconstructLivePath(transcriptLines)) {
    let entry;
    try {
      entry = JSON.parse(raw);
    } catch {
      continue;
    }
    if (entry?.isMeta === true) continue;
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
