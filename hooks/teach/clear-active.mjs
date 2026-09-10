import { clearActive } from "./session-state.mjs";

async function main() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return;
  }
  if (!payload?.transcript_path) return;
  clearActive(payload.transcript_path);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
