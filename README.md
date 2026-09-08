# sensei

A Claude Code plugin: a personal AI learning system built on two teaching principles (inspired in part by [amosblomqvist/learn](https://github.com/amosblomqvist/learn)).

## What's in it

- `skills/teach/` — the teaching philosophy and process (probe → plan → teach)
- `skills/visualize/` — adds a correct, minimal diagram to a lesson via a maker subagent
- `agents/` — `researcher`, `mermaid-maker`, `svg-maker`
- `scripts/` — render/publish scripts for the maker agents, plus the `mastery.mjs` ledger CLI the `teach` skill uses for cross-session mastery tracking — all invoked directly via `Bash` (no MCP server)
- `hooks/md-log/` — mirrors a session to a markdown file (`/md-log <path>`, `/md-unlog`)

## Features

- **teach** — the core teaching skill: probes the learner's current level via graded quizzes, clarifies their actual goal, presents a dependency-map plan for approval, then teaches node-by-node (motivate → establish → connect → quiz-check). Tracks mastery across sessions in a small local ledger (`~/.claude/sensei/mastery.json`), so a returning learner isn't re-probed on concepts they've already passed. Use case: learning any topic for genuine understanding rather than memorization.
- **visualize** — adds a diagram or geometric visual to a lesson, dispatching to `mermaid-maker` for structural/relational diagrams (dependency graphs, flows, sequences, trees) or `svg-maker` for spatial/geometric visuals Mermaid can't express (coordinate geometry, plots, physical layouts). Use case: any point in a lesson (or an ad-hoc request) where a picture would land better than prose.
- **md-log** / **md-unlog** — link or unlink a markdown file (e.g. an Obsidian vault note) to mirror the current session live: every prompt, response, and `AskUserQuestion` question/answer pair is appended as an Obsidian-style callout as it happens, with prior conversation backfilled on first link. Use case: keep a durable, readable record of a teaching session in your own notes; `md-unlog` turns that off when you no longer want a session recorded.
- **researcher** / **mermaid-maker** / **svg-maker** — the subagents `teach` and `visualize` dispatch internally: `researcher` grounds a lesson plan in real sourced facts before teaching begins; `mermaid-maker` and `svg-maker` each author, render, visually verify, and publish one diagram. Not invoked directly by the user, but worth documenting since they're visible in `/agents`.

## Install (local development)

Run from inside this directory (`sensei`'s own root):

```bash
claude plugin marketplace add ./
claude plugin install sensei@rishichawda
```

## Install (production)

```bash
claude plugin marketplace add https://github.com/rishichawda/sensei
claude plugin install sensei@rishichawda
```
