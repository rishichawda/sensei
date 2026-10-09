// Narrow, deterministic backstop for skill discovery: "continue teaching me X"
// in a fresh session has no prior turn to anchor semantic matching against,
// and relying on that matching alone was observed to silently fail twice in
// a row (only the explicit /sensei:teach slash command worked). This is not
// an intent classifier — just the handful of phrasings that actually showed
// up failing, per surgical-patch scope.
import { isActive } from "./session-state.mjs";

const TRIGGER_PATTERNS = [/\bteach me\b/i, /\bcontinue teaching\b/i, /\bresume teaching\b/i];

// A subagent hand-back reaches UserPromptSubmit like a typed prompt, with the
// same payload keys; only the harness's envelope on `prompt` tells them apart
// (captured live 2026-10-09). It is model output, so a trigger phrase quoted in
// it is not the user asking to learn.
const HAND_BACK_ENVELOPE = "<agent-message ";

export function checkPrompt(prompt) {
  if (typeof prompt !== "string" || !prompt) return null;
  if (prompt.startsWith(HAND_BACK_ENVELOPE)) return null;
  if (!TRIGGER_PATTERNS.some((re) => re.test(prompt))) return null;
  return "This prompt matches a teach-skill trigger phrase. Invoke Skill(sensei:teach) for this request, even if it looks like a plain conversational ask (e.g. continuing/resuming) and even in a fresh session with no visible prior context — the skill itself checks the mastery ledger for prior sessions on this topic.";
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
  // The nudge exists for a fresh session. While a teach session is active (marker
  // cleared only when the learner confirms done) a "teach me that again" is part
  // of the lesson, not a request to start one.
  if (payload?.transcript_path && isActive(payload.transcript_path)) return;
  const output = checkPrompt(payload?.prompt);
  if (output) process.stdout.write(output);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
