---
description: Link a markdown file to mirror this session (backfills history)
argument-hint: <path-to-vault-note.md>
allowed-tools: Bash(node:*)
---

Run `node "${CLAUDE_PLUGIN_ROOT}/hooks/md-log/link.mjs" "$1"` using the Bash tool. Your entire reply this turn must be that command's output, verbatim, and nothing else — no commentary, no summary, and no continuation of any other task that was already in progress before this command ran.
