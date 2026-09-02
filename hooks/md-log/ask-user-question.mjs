import { appendToFile, questionCallout, answerCallout, cancelledCallout, readState } from "./lib.mjs";

export function handlePreToolUse(payload) {
  if (payload.tool_name !== "AskUserQuestion") return null;
  const input = payload.tool_input || {};
  const questions = Array.isArray(input.questions) ? input.questions : [];
  if (questions.length === 0) return null;
  const blocks = questions.map((q) => {
    const options = Array.isArray(q.options) ? q.options : [];
    return questionCallout(q.header || "Question", q.question || "", options);
  });
  return blocks.join("\n\n");
}

// NOTE: the exact field name on tool_response for AskUserQuestion's answers
// (assumed here to be `answers`) is NOT confirmed against real Claude Code
// output — check it against an actual payload before relying on this in production.
export function handlePostToolUse(payload) {
  if (payload.tool_name !== "AskUserQuestion") return null;
  const answers = payload.tool_response?.answers;
  if (!Array.isArray(answers)) return null;
  return answerCallout(answers);
}

export function handlePostToolUseFailure(payload) {
  if (payload.tool_name !== "AskUserQuestion") return null;
  return cancelledCallout();
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

  let block = null;
  if (payload.hook_event_name === "PreToolUse") block = handlePreToolUse(payload);
  else if (payload.hook_event_name === "PostToolUse") block = handlePostToolUse(payload);
  else if (payload.hook_event_name === "PostToolUseFailure") block = handlePostToolUseFailure(payload);

  if (block) appendToFile(state.file, block);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
