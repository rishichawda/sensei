# Mastery ledger protocol

The mastery ledger (`scripts/mastery.mjs`, backed by one file per topic under `<CLAUDE_CONFIG_DIR>/sensei/ledgers/<topic-slug>.json`) is how `teach` remembers what a learner already knows across sessions. This file is the single source of truth for every ledger interaction — read the section for what you're doing right now and follow it exactly.

**Node writes, goal capture, plan persistence, and the Phase 1a probe log are now automatic.** Every Phase 1a probe, every graded quiz-check, the learning goal, and the approved dependency map are written by `hooks/teach/mastery-record.mjs` — a `PostToolUse` hook that fires on every `AskUserQuestion` call — the moment you attach the right `metadata.source` JSON to the call, as described in `quiz-protocol.md` and `SKILL.md`'s Phase 1a/1b/2/3. You do not run a separate `Bash` `record` command for any of this anymore. Sections B and C below describe what the hook does, so you understand what's already been recorded when you read the ledger back — they are not instructions to act on.

**Resolve `<plugin-root>` once, before step 0 — don't reach for `${CLAUDE_PLUGIN_ROOT}` in a `Bash` call.** That env var is guaranteed for hook subprocesses (`hooks/hooks.json` gets it reliably every time) but not for commands you run yourself via the `Bash` tool — there it routinely expands to empty and `mastery.mjs` fails with `Cannot find module`. Skip the guesswork: you already have the answer, because `Read` just gave you this file's absolute path, `<plugin-root>/skills/teach/mastery-ledger-protocol.md`. Strip that suffix to get `<plugin-root>`, then use that literal absolute path — never `${CLAUDE_PLUGIN_ROOT}`, and never a filesystem-wide search — in every `mastery.mjs` command below, for the rest of this session.

## Section A — Resolve the topic & look up prior mastery

Read this once, at the very start of Phase 1a, before probing.

0. **Check for an in-progress session before doing anything else.** Once you have a candidate topic slug (even a tentative one, before the disambiguation steps below), run `node "<plugin-root>/scripts/mastery.mjs" get-session "<candidate-topic>"` via `Bash`. This prints the session row (`{goal, dependencyMap, nextNodeId, status, probes, updatedAt}`) or the literal `null` if none exists.
   - `null`, or a row with `status: "complete"` → today's behavior — fresh intake, no special-casing.
   - Row with `status: "intake"` → don't re-ask the goal if it's already set — recap it in one sentence and confirm ("last time you said your goal was X — still the target?"). Resume Phase 1a probing, starting from the row's `probes` list (what was already asked and answered) and skipping only nodes that already carry `passed` or `failed` in the `get` output (step 4 below) — real graded coordinates. Nodes carrying only `seen` stay probe-eligible; `seen` is coverage, not mastery.
   - Row with `status: "planned"` or `"in-progress"` → skip Phase 1b and Phase 2 entirely. Recap the stored `goal` and a one-line summary of `dependencyMap`, then resume Phase 3 directly at `nextNodeId`.
1. **List existing topics first.** Run `node "<plugin-root>/scripts/mastery.mjs" topics` via `Bash`. A learner won't retype the exact words they used weeks or months ago, so never key the lookup on today's phrasing alone.
2. **Match by meaning, not exact text.** Compare the current subject against that list — `powershell`, `powershell-scripting`, and `learn-powershell` are the same topic wearing different words.
   - Exactly one existing slug plausibly matches → reuse it verbatim as `<topic>`.
   - More than one plausibly matches (e.g. both `networking` and `home-networking` are live candidates) → don't guess. Ask which one they mean with `AskUserQuestion`, options named after the topic slugs in plain words. `<topic>` isn't resolved yet at this point, so tag the call `metadata: {source: JSON.stringify({app: "sensei-teach", v: 1, kind: "other"})}` — no `topic` field, since none exists yet to attach.
   - What they said names something narrower than a whole subject — a specific concept or node, not a topic (e.g. "let's continue with pipeline" rather than "let's continue with PowerShell") → that's a signal they mean to resume inside an existing topic. Run `node "<plugin-root>/scripts/mastery.mjs" get "<candidate-slug>"` for each plausible topic slug from the list (or all of them, if there are only a few) and check whether any topic's node IDs match what they said.
     - Exactly one topic's node IDs match → reuse that topic's slug as `<topic>` and treat this as resuming that specific node — skip straight to quiz-checking or extending it in Phase 3 rather than rebuilding the whole dependency map from scratch, though it's still worth a quick Phase 2 recap so they see where it sits.
     - More than one topic's node IDs match → again ask which one via `AskUserQuestion` instead of picking for them, tagged the same way: `metadata: {source: JSON.stringify({app: "sensei-teach", v: 1, kind: "other"})}`.
   - None of the above → pick a short, canonical noun for the subject right now — e.g. `networking`, not the learner's full sentence — as the new `<topic>`.
3. **Lock in `<topic>`.** Whichever branch above fired, reuse that exact string in every mastery-ledger call for the rest of this session, including the tag on every Phase 3 quiz-check call — a topic string that drifts between calls silently breaks the lookup.
   - **If step 0's candidate guess differs from this resolved `<topic>`, re-run `get-session "<topic>"` now, before concluding anything about fresh vs. in-progress.** Step 0 ran on a tentative guess to give you a fast path when the guess happens to be right; it is not a substitute for checking the real thing once you know it. A wrong guess at step 0 (e.g. `"powershell"` guessed, `"powershell-scripting"` actually resolved) must not be read as "no prior session" — re-check, and if this second call returns a real row, apply step 0's branches (`intake`/`planned`/`in-progress`) against it exactly as if it had come back that way the first time.
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

Read this at Phase 2, once every node in the dependency map has an ID, to see what's already been recorded. The hook does the writing; the only thing you do here is apply the planning marks below.

Phase 1a's probes don't attach to node IDs — they're logged in the session row's `probes` list (printed by `get-session`), not as per-node entries (what `get` prints), because no node ID existed yet when they ran. So there is no per-node `seen` to expect here from probing; what you're checking is narrower than it might sound:

1. If Section A's lookup returned `passed` for a node's ID: mark it `*(already covered)*` in the map, and keep its Phase 3 treatment brief rather than dropping it from the map or re-teaching it in full.
2. If a node shows `seen`: that came from some other unquiz-checked touch (not from Phase 1a probing, which never targets a node ID) — treat it exactly like a node with no record at all for planning purposes.
3. You do not write anything here. If you expect the ledger to reflect something a Phase 1a probe established and it doesn't show up, remember it lives in the session row's `probes` (printed by `get-session`), not in the per-node entries `get` prints — check there, or `~/.claude/sensei/mastery-hook-debug.log` (under `$CLAUDE_CONFIG_DIR/sensei/` if that is set) for a `tagged: false` entry around that question, before assuming the ledger itself is wrong.

**Before moving on, confirm:**
- [ ] Checked every node in the map against the ledger, before presenting the plan.
- [ ] Every `*(already covered)*` mark traces back to an actual `passed` from Section A's lookup.
- [ ] If a node you expected `seen` on doesn't have it, checked whether that's because the coverage actually lives in the session row's `probes` (Phase 1a probing) rather than assuming the ledger is wrong.

## Section C — Record on quiz-check

Read this at Phase 3, to understand what happens after each quiz-check — not to take action.

The moment you run a quiz-check's `AskUserQuestion` call with the right `metadata.source` (per `quiz-protocol.md`), `hooks/teach/mastery-record.mjs` grades it against the `correct` value you supplied and writes `passed`/`failed` — you do not run a separate `record` command. It also advances `sessions[topic].nextNodeId` for you when a `passed` lands on the current frontier node.

**Before moving on, confirm:**
- [ ] The quiz-check's `AskUserQuestion` call included `metadata.source` with the right `topic`/`node`/`correct` — if you're unsure it did, check `~/.claude/sensei/mastery-hook-debug.log` (under `$CLAUDE_CONFIG_DIR/sensei/` if that is set) for a `tagged: false` entry rather than assuming the write happened.
- [ ] Used the same `<topic>` string resolved in Section A inside that metadata.
