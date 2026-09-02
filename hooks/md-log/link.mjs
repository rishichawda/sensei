// sensei/hooks/md-log/link.mjs
import { existsSync, statSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { writeState, findCurrentTranscript } from "./lib.mjs";
import { backfill } from "./session-start.mjs";

function main() {
  const filepath = process.argv[2];
  if (!filepath) {
    console.log("Usage: /md-log <filepath>");
    return;
  }
  const resolved = resolve(filepath);
  if (!existsSync(resolved) || !statSync(resolved).isFile()) {
    console.log(`File does not exist or is not a file: ${resolved}`);
    return;
  }
  const transcriptPath = findCurrentTranscript();
  if (!transcriptPath) {
    console.log("Could not locate this session's transcript file — linking failed.");
    return;
  }

  let written = 0;
  let lastLine = 0;
  if (existsSync(transcriptPath)) {
    const rawText = readFileSync(transcriptPath, "utf8").trim();
    if (rawText) {
      const lines = rawText.split("\n");
      written = backfill(lines, resolved);
      lastLine = lines.length;
    }
  }

  writeState(transcriptPath, { file: resolved, lastLine });
  console.log(`Linked: ${resolved} (${written} entries backfilled)`);
}

main();
