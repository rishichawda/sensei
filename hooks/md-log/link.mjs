// sensei/hooks/md-log/link.mjs
import { existsSync, statSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, extname } from "node:path";
import { writeState, findCurrentTranscript } from "./lib.mjs";
import { backfill } from "./session-start.mjs";

// The command passes the typed arguments on stdin, because a shell word split
// would break a path with spaces; a pair of quotes the user typed is dropped.
function readPathFromStdin() {
  if (process.stdin.isTTY) return "";
  let text;
  try {
    text = readFileSync(0, "utf8");
  } catch {
    return "";
  }
  return text.trim().replace(/^(["'])(.*)\1$/, "$2");
}

function main() {
  const filepath = process.argv[2] ?? readPathFromStdin();
  if (!filepath) {
    console.log("Usage: /md-log <filepath>");
    return;
  }
  const resolved = resolve(filepath);
  if (extname(resolved).toLowerCase() !== ".md") {
    console.log(`Only .md files can be linked: ${resolved}`);
    return;
  }
  if (existsSync(resolved)) {
    if (!statSync(resolved).isFile()) {
      console.log(`Not a file: ${resolved}`);
      return;
    }
  } else {
    try {
      writeFileSync(resolved, "", "utf8");
    } catch {
      console.log(`Could not create file: ${resolved} (does its parent directory exist?)`);
      return;
    }
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
