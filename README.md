# sensei

A Claude Code plugin: a personal AI learning system built on two teaching principles (inspired in part by [amosblomqvist/learn](https://github.com/amosblomqvist/learn)).

## What's in it

- `skills/teach/` — the teaching philosophy and process (probe → plan → teach)
- `skills/visualize/` — adds a correct, minimal diagram to a lesson via a maker subagent
- `agents/` — `researcher`, `mermaid-maker`, `svg-maker`
- `scripts/` — the render/publish scripts the two maker agents use, invoked directly via `Bash` (no MCP server)
- `hooks/md-log/` — mirrors a session to a markdown file (`/md-log <path>`, `/md-unlog`)

## Install (local development)

Run from inside this directory (`sensei`'s own root):

```bash
claude plugin marketplace add ./
claude plugin install sensei@sensei-dev
```
