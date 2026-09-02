// sensei/hooks/md-log/unlink.mjs
import { readState, writeState, findCurrentTranscript } from "./lib.mjs";

function main() {
  const transcriptPath = findCurrentTranscript();
  if (!transcriptPath) {
    console.log("Could not locate this session's transcript file.");
    return;
  }
  const state = readState(transcriptPath);
  if (!state.file) {
    console.log("No file linked.");
    return;
  }
  writeState(transcriptPath, { file: null });
  console.log(`Unlinked: ${state.file}`);
}

main();
