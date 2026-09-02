---
description: Link a markdown file to mirror this session (backfills history)
argument-hint: <path-to-vault-note.md>
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/hooks/md-log/link.mjs" "$1"`

Report the result above to the user verbatim. Do not take any further action.
