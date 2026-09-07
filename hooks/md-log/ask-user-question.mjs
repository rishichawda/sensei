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

// tool_response.answers is an object keyed by question text, each value the
// chosen option's label as a plain string (not an array of {label} objects) —
// confirmed against a real Claude Code payload.
export function handlePostToolUse(payload) {
  if (payload.tool_name !== "AskUserQuestion") return null;
  const answers = payload.tool_response?.answers;
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) return null;
  return answerCallout(Object.values(answers));
}

// Dismissing/declining an AskUserQuestion call is rejected at Claude Code's
// permission layer before the tool ever executes, so it never reaches either
// PostToolUse or PostToolUseFailure — confirmed against a real session. This
// handler still covers a genuine AskUserQuestion execution failure, if one
// ever occurs; it does not (and cannot) cover the user declining to answer.
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
