import { syncVaultPath, pruneActive, logVaultError } from "./state.mjs";

// Hooks receive the vault option as an environment variable; scripts the model runs
// through Bash do not. Copy it to a file they can read, and clear the file when the
// option is unset. Also drop active-topic files left by sessions that never wrapped.
async function main() {
  for await (const _chunk of process.stdin);
  try {
    syncVaultPath();
    pruneActive();
  } catch (error) {
    logVaultError(`session-start failed: ${error.message}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
