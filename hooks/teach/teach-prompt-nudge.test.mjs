import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkPrompt } from "./teach-prompt-nudge.mjs";
import { clearActive, markActive } from "./session-state.mjs";

const SCRIPT = fileURLToPath(new URL("./teach-prompt-nudge.mjs", import.meta.url));

test("checkPrompt returns null for an unrelated prompt", () => {
  assert.equal(checkPrompt("what's the weather like"), null);
});

test("checkPrompt returns null for empty/non-string input", () => {
  assert.equal(checkPrompt(""), null);
  assert.equal(checkPrompt(undefined), null);
});

test("checkPrompt matches 'teach me'", () => {
  assert.match(checkPrompt("teach me how to write PowerShell scripts"), /Skill\(sensei:teach\)/);
});

test("checkPrompt matches 'continue teaching' case-insensitively", () => {
  assert.match(checkPrompt("Continue Teaching me how to write powershell commands"), /Skill\(sensei:teach\)/);
});

test("checkPrompt matches 'resume teaching'", () => {
  assert.match(checkPrompt("can we resume teaching the rust session"), /Skill\(sensei:teach\)/);
});

test("checkPrompt returns null for a subagent hand-back that quotes a trigger phrase", () => {
  const quoted = "The nudge matched the phrase teach me in that prompt.";
  assert.match(checkPrompt(quoted), /Skill\(sensei:teach\)/);
  const handBack = `<agent-message from="a1dbdc9b815acd11c">\n[Subagent hand-back] The text below is the final report.\n  ${quoted}\n</agent-message>`;
  assert.equal(checkPrompt(handBack), null);
});

test("main() prints nothing for a non-matching prompt", () => {
  const out = execFileSync(process.execPath, [SCRIPT], { input: JSON.stringify({ prompt: "fix this bug" }) });
  assert.equal(out.toString(), "");
});

test("main() prints the nudge for a matching prompt", () => {
  const out = execFileSync(process.execPath, [SCRIPT], { input: JSON.stringify({ prompt: "teach me PowerShell" }) });
  assert.match(out.toString(), /Skill\(sensei:teach\)/);
});

test("main() survives unparseable JSON on stdin without crashing", () => {
  assert.doesNotThrow(() => execFileSync(process.execPath, [SCRIPT], { input: "not json" }));
});

function runNudge(prompt, transcriptPath) {
  return execFileSync(process.execPath, [SCRIPT], {
    input: JSON.stringify({ prompt, transcript_path: transcriptPath }),
  }).toString();
}

test("main() prints nothing while the teach session is active, and nudges again once it is cleared", () => {
  const dir = mkdtempSync(join(tmpdir(), "nudge-"));
  const transcript = join(dir, "t.jsonl");
  try {
    markActive(transcript);
    assert.equal(runNudge("teach me that again", transcript), "");
    clearActive(transcript);
    assert.match(runNudge("teach me rust", transcript), /Skill\(sensei:teach\)/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
