// Narrow, deterministic backstop for skill discovery: "continue teaching me X"
// in a fresh session has no prior turn to anchor semantic matching against,
// and relying on that matching alone was observed to silently fail twice in
// a row (only the explicit /sensei:teach slash command worked). This is not
// an intent classifier — just the handful of phrasings that actually showed
// up failing, per surgical-patch scope.
const TRIGGER_PATTERNS = [/\bteach me\b/i, /\bcontinue teaching\b/i, /\bresume teaching\b/i];

export function checkPrompt(prompt) {
  if (typeof prompt !== "string" || !prompt) return null;
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
  const output = checkPrompt(payload?.prompt);
  if (output) process.stdout.write(output);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
