import { appendToFile, userBlock, readState } from "./lib.mjs";

export function handleUserPromptSubmit(payload) {
  const prompt = (payload.prompt || "").trim();
  if (!prompt) return null;
  return userBlock(prompt);
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
  const block = handleUserPromptSubmit(payload);
  if (block) appendToFile(state.file, block);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
