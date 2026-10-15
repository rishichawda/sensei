# Changelog

All notable changes to sensei are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). sensei uses [semantic versioning](https://semver.org/).

## [Unreleased]

## [0.2.0] - 2026-10-15

### Added

- Set `vault_path` and sensei saves each concept's explanation, quiz questions (as Obsidian Spaced Repetition flashcards), your answers and how mistakes were re-explained into your Obsidian vault, one append-only note per concept, with a map note per topic.
- `scripts/vault.mjs` for the teach skill: save a digest, check the vault status, decline or set up a vault.
- Each graded check becomes a flashcard in the concept note. The teach skill writes an open question and a short answer for it (`card` in the question tag), so the card works without the quiz options in front of you. When it writes none, the card is the question followed by its options.
- `/map` opens a pane with the approved plan, one chip per step with its status, what it needs and what it unlocks. A line above the prompt shows where you are in the lesson, and a toast reports each pass or miss. The plan is no longer drawn as a diagram in chat.
- The vault question offers setup once, asks for the folder path with a question, and stops asking if you decline.

### Changed

- A vault folder set with `/plugin configure sensei` takes effect on your next message, not after a restart.

### Removed

- `/md-log`, `/md-unlog` and the whole-transcript mirror. The vault notes replace them.

## [0.1.1] - 2026-10-12

Everything since the `v0.1.0` tag.

### Added

- Progress is saved per topic in a local ledger (`~/.claude/sensei/ledgers/<topic>.json`, managed by `scripts/mastery.mjs`). A returning learner resumes at the next unfinished step and skips what they already passed. The ledger is versioned, written atomically, and a file that cannot be read is backed up instead of lost.
- `teach` hooks record each answer as passed or failed from the learner's own choice, so the record does not depend on the model reporting its own results.
- Every `teach` question carries a `sensei-teach` tag, and a hook denies a question whose tag is missing or malformed and says what is wrong. One probe or check call can carry up to four questions.
- A hook nudges the model to start `teach` when a learning request would otherwise skip it, including phrasing such as "continue teaching me X". It stays quiet while a lesson is active and on a subagent hand-back.
- Trigger evals for the skills and agents under `evals/`.
- A marketplace listing with a new description, a display name and the `learning` category.

### Changed

- `teach` asks for the learner's goal before it probes, then finds the edge of what they know in rounds of questions, tracked per strand of the topic.
- The plan and its dependency-map diagram end the turn, so the learner's go-ahead comes as a separate reply.
- A lesson teaches a few related steps and checks them in one round of questions. After a miss, the turn ends so the learner can answer.
- `teach` explains in plain language, keeps how it works out of what the learner reads, and says nothing while it looks up saved progress or before a tool call the learner would not notice.
- The `teach` description now covers learning requests only. The `researcher` description says when to use it.
- `/md-log` links only `.md` files, accepts a path with spaces, and finds the current session's transcript by its session id. Backfill follows the real conversation order and skips injected skill text.

### Fixed

- A Mermaid diagram with a math label no longer depends on a `katex` version with a prototype pollution alert (GHSA-238p-pmpm-9mq7); `katex` is pinned to 0.18.2 or newer, and `dompurify` is updated.
- The diagram render and publish scripts resolve symlinks and refuse to write outside `$TMPDIR`.
- The `researcher` agent no longer has the `Bash` tool and treats fetched pages and search results as data, not instructions.
- A `/md-log` backfill no longer fails on a literal `null` line in the transcript.

## [0.1.0] - 2026-09-07

First tagged version.

- `teach` skill: probes the learner's level, draws a dependency-map plan and waits for the learner's go-ahead, then teaches node by node with a quiz check after each.
- `visualize` skill with the `mermaid-maker` and `svg-maker` agents, and the `researcher` agent.
- `/md-log` and `/md-unlog` commands to mirror a session to a markdown file.
