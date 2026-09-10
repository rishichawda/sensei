# Mastery ledger protocol

The mastery ledger (`scripts/mastery.mjs`, backed by `<CLAUDE_CONFIG_DIR>/sensei/mastery.json`) is how `teach` remembers what a learner already knows across sessions. This file is the single source of truth for every ledger interaction — read the section for what you're doing right now and follow it exactly.

**Node writes, goal capture, and plan persistence are now automatic.** Every graded quiz-check, every Phase 1a `seen` touch, the learning goal, and the approved dependency map are written by `hooks/teach/mastery-record.mjs` — a `PostToolUse` hook that fires on every `AskUserQuestion` call — the moment you attach the right `metadata.source` JSON to the call, as described in `quiz-protocol.md` and `SKILL.md`'s Phase 1b/2/3. You do not run a separate `Bash` `record` command for any of this anymore. Sections B and C below describe what the hook does, so you understand what's already been recorded when you read the ledger back — they are not instructions to act on.

**Resolve `<plugin-root>` once, before step 0 — don't reach for `${CLAUDE_PLUGIN_ROOT}` in a `Bash` call.** That env var is guaranteed for hook subprocesses (`hooks/hooks.json` gets it reliably every time) but not for commands you run yourself via the `Bash` tool — there it routinely expands to empty and `mastery.mjs` fails with `Cannot find module`. Skip the guesswork: you already have the answer, because `Read` just gave you this file's absolute path, `<plugin-root>/skills/teach/mastery-ledger-protocol.md`. Strip that suffix to get `<plugin-root>`, then use that literal absolute path — never `${CLAUDE_PLUGIN_ROOT}`, and never a filesystem-wide search — in every `mastery.mjs` command below, for the rest of this session.

## Section A — Resolve the topic & look up prior mastery

Read this once, at the very start of Phase 1a, before probing.

0. **Check for an in-progress session before doing anything else.** Once you have a candidate topic slug (even a tentative one, before the disambiguation steps below), run `node "<plugin-root>/scripts/mastery.mjs" get-session "<candidate-topic>"` via `Bash`. This prints the session row (`{goal, dependencyMap, nextNodeId, status, updatedAt}`) or the literal `null` if none exists.
   - `null`, or a row with `status: "complete"` → today's behavior — fresh intake, no special-casing.
   - Row with `status: "intake"` → don't re-ask the goal if it's already set — recap it in one sentence and confirm ("last time you said your goal was X — still the target?"). Resume Phase 1a probing, skipping only nodes that already carry `passed` or `failed` in `topics[topicSlug]` (from step 4 below) — real graded coordinates. Nodes carrying only `seen` stay probe-eligible; `seen` is coverage, not mastery.
   - Row with `status: "planned"` or `"in-progress"` → skip Phase 1b and Phase 2 entirely. Recap the stored `goal` and a one-line summary of `dependencyMap`, then resume Phase 3 directly at `nextNodeId`.
1. **List existing topics first.** Run `node "<plugin-root>/scripts/mastery.mjs" topics` via `Bash`. A learner won't retype the exact words they used weeks or months ago, so never key the lookup on today's phrasing alone.
2. **Match by meaning, not exact text.** Compare the current subject against that list — `powershell`, `powershell-scripting`, and `learn-powershell` are the same topic wearing different words.
   - Exactly one existing slug plausibly matches → reuse it verbatim as `<topic>`.
   - More than one plausibly matches (e.g. both `networking` and `home-networking` are live candidates) → don't guess. Ask which one they mean with `AskUserQuestion`, options named after the topic slugs in plain words.
   - What they said names something narrower than a whole subject — a specific concept or node, not a topic (e.g. "let's continue with pipeline" rather than "let's continue with PowerShell") → that's a signal they mean to resume inside an existing topic. Run `node "<plugin-root>/scripts/mastery.mjs" get "<topic>"` for each plausible topic slug from the list (or all of them, if there are only a few) and check whether any topic's node IDs match what they said.
     - Exactly one topic's node IDs match → reuse that topic's slug as `<topic>` and treat this as resuming that specific node — skip straight to quiz-checking or extending it in Phase 3 rather than rebuilding the whole dependency map from scratch, though it's still worth a quick Phase 2 recap so they see where it sits.
     - More than one topic's node IDs match → again ask which one via `AskUserQuestion` instead of picking for them.
   - None of the above → pick a short, canonical noun for the subject right now — e.g. `networking`, not the learner's full sentence — as the new `<topic>`.
3. **Lock in `<topic>`.** Whichever branch above fired, reuse that exact string in every mastery-ledger call for the rest of this session, including every Phase 3 `record` call — a topic string that drifts between calls silently breaks the lookup.
4. **Look up prior records.** Run `node "<plugin-root>/scripts/mastery.mjs" get "<topic>"` via `Bash` with that string. This prints a JSON object keyed by concept-node ID (the same per-node IDs Phase 2 assigns when building the dependency map), each with a `status` (`seen`/`passed`/`failed`) and `lastTaughtAt`.
   - `passed` → already at or past the edge for that strand. Don't spend probe time re-establishing it from scratch, though a quick confirming question is fine if something else they say casts doubt on it.
   - `failed` → the opposite signal: probe it first, since it's a known gap rather than an unknown one.
   - `{}` (empty) → no prior record on this topic; probe normally.

**Before moving on, confirm:**
- [ ] Ran `topics` before deciding anything about the topic string.
- [ ] If more than one topic or node plausibly matched, asked via `AskUserQuestion` rather than guessing.
- [ ] Have exactly one resolved `<topic>` string, ready to reuse for the rest of the session.
- [ ] Ran `get "<topic>"` and read the result before starting to probe.

## Section B — Per-node ledger check while building the map

Read this at Phase 2, once every node in the dependency map has an ID, to understand what's already been recorded — not to take action, since the hook already did.

For each node, `hooks/teach/mastery-record.mjs` will have already written a `seen` record the moment a Phase 1a probe question for that node was answered (as long as the question carried the right `metadata.source`, per `quiz-protocol.md`). So when you check the ledger here:

1. If Section A's lookup returned `passed` for a node's ID: mark it `*(already covered)*` in the map, and keep its Phase 3 treatment brief rather than dropping it from the map or re-teaching it in full.
2. If a node instead shows `seen`: that just means Phase 1a asked about it, not that they know it — treat it exactly like a node with no record at all for planning purposes.
3. You do not write anything here. If a node you expected to see `seen` on doesn't have it, that means its Phase 1a probe question either wasn't teach-tagged correctly or the hook didn't fire — check `mastery-hook-debug.log` for a `tagged: false` entry around that question before assuming the ledger itself is wrong.

**Before moving on, confirm:**
- [ ] Checked every node in the map against the ledger, before presenting the plan.
- [ ] Every `*(already covered)*` mark traces back to an actual `passed` from Section A's lookup.
- [ ] If any expected `seen` entry is missing, checked `mastery-hook-debug.log` rather than assuming.

## Section C — Record on quiz-check

Read this at Phase 3, to understand what happens after each quiz-check — not to take action.

The moment you run a quiz-check's `AskUserQuestion` call with the right `metadata.source` (per `quiz-protocol.md`), `hooks/teach/mastery-record.mjs` grades it against the `correct` value you supplied and writes `passed`/`failed` — you do not run a separate `record` command. It also advances `sessions[topic].nextNodeId` for you when a `passed` lands on the current frontier node.

**Before moving on, confirm:**
- [ ] The quiz-check's `AskUserQuestion` call included `metadata.source` with the right `topic`/`node`/`correct` — if you're unsure it did, check `mastery-hook-debug.log` for a `tagged: false` entry rather than assuming the write happened.
- [ ] Used the same `<topic>` string resolved in Section A inside that metadata.
