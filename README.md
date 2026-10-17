# sensei

Learn anything in Claude Code with a plan you approve of first and a check you pass at each step.

[![CI](https://github.com/rishichawda/sensei/actions/workflows/ci.yml/badge.svg)](https://github.com/rishichawda/sensei/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/rishichawda/sensei)](https://github.com/rishichawda/sensei/releases)
[![License](https://img.shields.io/github/license/rishichawda/sensei)](https://github.com/rishichawda/sensei/blob/main/LICENSE)

<!-- Demo GIF goes here. -->

<p align="center"><img src="assets/lesson-with-map.png" alt="A lesson in the terminal: the explanation on the left, the map pane on the right, and the step line above the prompt." width="64%"></p>

An AI explanation can be very clear as you're reading it, and then be completely gone by the next day. Sensei is built around two habits that combat that.

**You see the path before you walk it.** Before teaching sensei asks what you want from the topic, assesses your current level with a few graded questions and then draws up the plan as a dependency map showing what ideas build on what. You either approve the map or make changes to it. It then teaches in that order so nothing is explained before the idea it depends on.

**You prove each step as you go.** After each chunk of the lesson the Sensei will ask a short question. A hook will grade your answer and record it so the outcome is not dependent on what the model says happened. A correct answer sees you move on. A miss gets you a fresh explanation and another go.

<div align="center">
<table>
<tr>
<td width="50%"><img src="assets/plan-proposed.png" alt="The proposed plan, shown in the map pane and marked as not approved yet." width="100%"></td>
<td width="50%"><img src="assets/check-question.png" alt="A check question after the explanation, with the map pane still open." width="100%"></td>
</tr>
</table>
</div>

**Sensei remembers.** It saves your progress per topic on your machine so when you come back it picks up where you left off and skips the bits you've already done.

## Try it

```bash
claude plugin marketplace add https://github.com/rishichawda/sensei
claude plugin install sensei@rishichawda
```

Start a new session and ask Claude: *"Teach me how DNS resolution works"*.

## What you get

**A map you can open.** Type `/map` to get a pane showing the approved plan with one chip per step: ○ not started, ● in progress, ✓ passed, ✗ missed. Click on a chip to see what it builds on and what it builds to. A line appears above the prompt indicating your current position in the lesson and a toast appears for each pass/miss with the number of questions answered correctly. The map is not drawn in the chat.

**Notes in your Obsidian vault.** Set vault path via `/plugin configure sensei` and sensei will save what you learn, one note per concept under `sensei/<topic>/`. The note will contain the explanation, a flashcard for the Spaced Repetition plugin, your answers and how any mistake was re-explained. A `_map.md` note contains the plan as a diagram which Obsidian will draw up for you. The path takes effect on your next message. Concept notes are only ever appended to; sensei only rewrites `_map.md`.

<p align="center"><img src="assets/vault-map-note.png" alt="The plan's map note in Obsidian, with one note per concept in the folder beside it." width="64%"></p>

**Diagrams when they're useful.** A lesson can contain a diagram created by a bundled helper which will check its own output prior to displaying it. Mermaid is used for structure and flow, SVG for geometry and plots. If a diagram can't be generated then the lesson proceeds without it.

## Requirements

* Claude Code 2.1.281 or later. The map pane, the line above the prompt and the toasts need it.
* Optional: [Obsidian](https://obsidian.md) and its Spaced Repetition plugin (for the vault notes and flashcards).

## Why I built it

One weekend morning, coffee in hand at my desk, I came across a [YouTube video](https://www.youtube.com/watch?v=kzcI5F4tGiU) about using AI and Obsidian to learn anything. I use Obsidian and love picking up new skills, so I wanted a tutor in the tool I already use, one that keeps what I learn in my own notes. The video linked a project, but that was for pi. So I made one myself as a Claude Code plugin. It plans before it teaches, checks before it moves on, and remembers where I stopped.

## Contributing and license

See [CONTRIBUTING.md](CONTRIBUTING.md) and the [code of conduct](CODE_OF_CONDUCT.md). Sensei is released under the [Apache License 2.0](LICENSE).