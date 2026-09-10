import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { checkPrompt } from "./teach-prompt-nudge.mjs";

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
