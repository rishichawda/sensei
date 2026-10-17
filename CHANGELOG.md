# Changelog

All notable changes to sensei are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). sensei uses [semantic versioning](https://semver.org/).

## [Unreleased]

### Fixed

- The npm package now ships its lockfile, so a plugin installed from npm gets its npm packages and can draw diagrams; version 1.0.1 was packed without it. Releases stage the package on npm, and a maintainer approves each version before it goes live. ([cba1325](https://github.com/rishichawda/sensei/commit/cba132524f12e6ff14de950a9efdd68df7d4d832))

## [1.0.1] - 2026-10-17

### Added

- The plugin is also packaged for npm as `@rishichawda/sensei`, for marketplaces that list plugins from npm, and each release now publishes it there. The version in `package.json` and the lockfile now follows the plugin's at every release. ([1fd2082](https://github.com/rishichawda/sensei/commit/1fd2082c0a0c9214d5487a25d629a59868f18c8c))

## [1.0.0] - 2026-10-17

### Fixed

- A copy of sensei installed from GitHub now gets its npm packages, so a Mermaid diagram can be drawn as a picture there (on macOS with Chrome or Chromium installed); before, Claude Code skipped the package install and the picture could not be made. ([a4da1b8](https://github.com/rishichawda/sensei/commit/a4da1b8439d65c418877722d073b06054a6580b7))
- SVG pictures are now drawn by a renderer that installs with sensei, so they no longer need `rsvg-convert` or ImageMagick on your machine. ([f5828ea](https://github.com/rishichawda/sensei/commit/f5828ea8986bd012b60de06614fab9ab59a03805))

## [0.3.0] - 2026-10-17

### Changed

- The map, the line above the prompt, the toasts, the vault map note and the concept notes name each step in plain words, not by an internal ID, and the topic folder reads as words ("camera lens cleaning"). Each note carries a one-line comment asking you not to change the line sensei finds it by. The plan now carries a short label for every step. A map chip shows only the label; selecting it shows "Builds on" and "Leads to" instead of "Needs" and "Unlocks". ([ea8004a](https://github.com/rishichawda/sensei/commit/ea8004a2658149ccca47083b9b67ddf575b4052c))
- A note's record of a wrong pick names the quiz question and its right answer when the flashcard asks something else, so "Picked Photo B" is no longer cut off from the question it answered. ([0916b56](https://github.com/rishichawda/sensei/commit/0916b565f1812d5a02a2666dcdc7cbdcb5d589c3))
- A round of questions that holds a miss on a step now records that step as missed, also when another question on the same step was answered right; before, the later answer won and the miss was hidden from the map, the band and the toast. ([2a66aba](https://github.com/rishichawda/sensei/commit/2a66aba6e0108e4b3202a1be6fbf82176d4ac0ed))
- A check that passes one step and misses another now shows one toast with both results; before, the second toast was never shown. ([ac66e65](https://github.com/rishichawda/sensei/commit/ac66e65b33c3967ef3eac819b777fd29c2549495))
- The toast now also shows when you miss a step that had already been missed; it used to appear only when a step changed from one result to another. ([28bdb60](https://github.com/rishichawda/sensei/commit/28bdb602f3f4182a671e87849f975ec07c6260e4))
- The toast counts questions, not steps: a round of one right and two wrong answers on a single step reads "✓ 1 correct · ✗ 2 to retry", where it used to read only "retry". The band and the map still show steps. ([f5ac660](https://github.com/rishichawda/sensei/commit/f5ac6604d0ea4cf9c50b6438021ffcfb03aa4d25))
- The teach skill always writes the explanation as a message of its own before the first check of a lesson, also when you ask for short replies, and no longer uses its own working words in what you read. ([694b64d](https://github.com/rishichawda/sensei/commit/694b64d980c6554053682d125540f4d517956d98))

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
