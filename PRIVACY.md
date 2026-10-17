# Privacy

Last updated: 2026-10-17.

Sensei is a plugin that runs on your own machine inside Claude Code. Its author runs no server for it, collects no data from it, and has no way to see what you learn.

## What sensei stores on your machine

- **Progress ledger.** One file per topic under your Claude config directory (`~/.claude`, or the folder in `CLAUDE_CONFIG_DIR`), in `sensei/ledgers/`. It holds your stated goal, the approved plan, the result of each step (passed, missed, in progress), the shortened text of the level-check questions and your answers to them, and timestamps.
- **Lesson state.** A file for each running lesson in `sensei/active/`, the Obsidian vault path you set in `sensei/vault-path`, and two small marker files beside each session transcript (`.teach-active-state.json` and `.teach-invoked-state.json`).
- **Debug logs.** `sensei/mastery-hook-debug.log` and `sensei/vault-debug.log` keep the last 200 lines each. They hold topic and step names, the lesson's tag data and error messages. They do not hold the text of your questions or your answers.
- **Obsidian notes, only if you set a vault.** Notes under `<vault>/sensei/` with the explanation, a flashcard, your answers and how a mistake was re-explained.
- **Diagrams.** Rendered PNG files in a `viz/` folder in the project where you ran the lesson.

Sensei keeps this data until you delete it. The only automatic clean-up is that it removes its own lesson-state files left by a session that never finished.

## What leaves your machine

Sensei's own code makes no network requests and has no telemetry.

- **Claude.** Your conversation, including the lesson, goes to Claude through Claude Code, as for any Claude Code session. Anthropic's [privacy policy](https://www.anthropic.com/legal/privacy) covers that.
- **Web research.** Before it teaches, and whenever it is unsure of a fact, sensei starts the `researcher` agent. It uses Claude Code's `WebSearch` and `WebFetch` tools to search the web and read pages. The model writes the search text, so it can contain the topic you asked about and what you told it you want from the topic. Sensei's code does not add your files, vault notes, progress or answers to a search. The agent treats the pages it reads as data, never as instructions.
- **Installation.** Claude Code installs sensei's npm packages from the plugin's lockfile when you install the plugin.

## Deleting your data

- Delete the `sensei/` folder in your Claude config directory to remove ledgers, lesson state and logs.
- Delete the `*.teach-active-state.json` and `*.teach-invoked-state.json` files beside session transcripts if you want those gone too.
- Delete `<vault>/sensei/` to remove the notes, and `viz/` in a project to remove its diagrams.

## Questions

Open an issue at <https://github.com/rishichawda/sensei/issues>.
