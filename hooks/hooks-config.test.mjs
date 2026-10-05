import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const hooksJson = JSON.parse(readFileSync(fileURLToPath(new URL("./hooks.json", import.meta.url)), "utf8"));

test("no hook removes the teach-active marker, so a teach session stays enforced across turns", () => {
  const commands = Object.values(hooksJson.hooks)
    .flat()
    .flatMap((entry) => entry.hooks.map((h) => h.command));
  assert.deepEqual(commands.filter((c) => /clear-active/.test(c)), []);
});
