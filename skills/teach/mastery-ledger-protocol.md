# Mastery ledger protocol

The mastery ledger (`scripts/mastery.mjs`, backed by `<CLAUDE_CONFIG_DIR>/sensei/mastery.json`) is how `teach` remembers what a learner already knows across sessions. This file is the single source of truth for every ledger interaction — read the section for what you're doing right now and follow it exactly.

**If a `mastery.mjs` command fails with `Cannot find module`,** `${CLAUDE_PLUGIN_ROOT}` didn't expand in that particular `Bash` call — rare, but don't give up on the ledger over it. You already know where this file lives, because you just read it: its path is `<plugin-root>/skills/teach/mastery-ledger-protocol.md`. Strip `/skills/teach/mastery-ledger-protocol.md` off the end of that path to get `<plugin-root>`, then retry the exact same command with that literal absolute path in place of `${CLAUDE_PLUGIN_ROOT}`.

## Section A — Resolve the topic & look up prior mastery

Read this once, at the very start of Phase 1a, before probing.

1. **List existing topics first.** Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/mastery.mjs" topics` via `Bash`. A learner won't retype the exact words they used weeks or months ago, so never key the lookup on today's phrasing alone.
2. **Match by meaning, not exact text.** Compare the current subject against that list — `powershell`, `powershell-scripting`, and `learn-powershell` are the same topic wearing different words.
   - Exactly one existing slug plausibly matches → reuse it verbatim as `<topic>`.
   - More than one plausibly matches (e.g. both `networking` and `home-networking` are live candidates) → don't guess. Ask which one they mean with `AskUserQuestion`, options named after the topic slugs in plain words.
   - What they said names something narrower than a whole subject — a specific concept or node, not a topic (e.g. "let's continue with pipeline" rather than "let's continue with PowerShell") → that's a signal they mean to resume inside an existing topic. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/mastery.mjs" get "<topic>"` for each plausible topic slug from the list (or all of them, if there are only a few) and check whether any topic's node IDs match what they said.
     - Exactly one topic's node IDs match → reuse that topic's slug as `<topic>` and treat this as resuming that specific node — skip straight to quiz-checking or extending it in Phase 3 rather than rebuilding the whole dependency map from scratch, though it's still worth a quick Phase 2 recap so they see where it sits.
     - More than one topic's node IDs match → again ask which one via `AskUserQuestion` instead of picking for them.
   - None of the above → pick a short, canonical noun for the subject right now — e.g. `networking`, not the learner's full sentence — as the new `<topic>`.
3. **Lock in `<topic>`.** Whichever branch above fired, reuse that exact string in every mastery-ledger call for the rest of this session, including every Phase 3 `record` call — a topic string that drifts between calls silently breaks the lookup.
4. **Look up prior records.** Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/mastery.mjs" get "<topic>"` via `Bash` with that string. This prints a JSON object keyed by concept-node ID (the same per-node IDs Phase 2 assigns when building the dependency map), each with a `status` (`seen`/`passed`/`failed`) and `lastTaughtAt`.
   - `passed` → already at or past the edge for that strand. Don't spend probe time re-establishing it from scratch, though a quick confirming question is fine if something else they say casts doubt on it.
   - `failed` → the opposite signal: probe it first, since it's a known gap rather than an unknown one.
   - `{}` (empty) → no prior record on this topic; probe normally.

**Before moving on, confirm:**
- [ ] Ran `topics` before deciding anything about the topic string.
- [ ] If more than one topic or node plausibly matched, asked via `AskUserQuestion` rather than guessing.
- [ ] Have exactly one resolved `<topic>` string, ready to reuse for the rest of the session.
- [ ] Ran `get "<topic>"` and read the result before starting to probe.

## Section B — Per-node ledger check while building the map

Read this at Phase 2, once every node in the dependency map has an ID — before drawing the diagram's final version, and before presenting anything.

For each node, in order:

1. If Phase 1a's lookup (Section A, step 4) returned `passed` for this node's ID: mark it `*(already covered)*` in the map, and keep its Phase 3 treatment brief rather than dropping it from the map or re-teaching it in full.
2. Otherwise, if this node has *no* existing ledger entry, but a Phase 1a probe question already clearly bore on it — right or wrong, this is about coverage, not grading — run `node "${CLAUDE_PLUGIN_ROOT}/scripts/mastery.mjs" record "<topic>" "<node-id>" seen` via `Bash` for it.
3. Never write `passed`/`failed` from this step — only a real Phase 3 quiz-check earns those, and `seen` doesn't trigger the *(already covered)* mark, so this can't cause Phase 3 to wrongly skip teaching something.
4. Never overwrite a node that already has any recorded status — this must never clobber a real `passed`/`failed` from an actual quiz-check.

This is what preserves Phase 1a's signal even for a session that ends right at the Phase 2 checkpoint without ever reaching Phase 3.

**If the learner asks for changes to the plan before approving it:** redraw the map, then repeat this check only for newly-added nodes. Leave any already-recorded `seen` entry for a node they asked to cut — it's still an accurate record of what Phase 1a established, even if this particular plan doesn't end up teaching it.

**Before moving on, confirm:**
- [ ] Checked every node in the map against the ledger, before presenting the plan — not after.
- [ ] Every `*(already covered)*` mark traces back to an actual `passed` from Section A's lookup.
- [ ] Every `seen` write was for a node with no prior record.
- [ ] No node that already had a status got overwritten.

## Section C — Record on quiz-check

Read this at Phase 3, every time a node's quiz-check completes.

1. Immediately after confirming the quiz-check result — right or wrong — run `node "${CLAUDE_PLUGIN_ROOT}/scripts/mastery.mjs" record "<topic>" "<node-id>" <passed|failed>` via `Bash`: `passed` if they got it right, `failed` if they missed it. A later quiz-check that then passes overwrites a prior `failed` with `passed`.
2. Use the exact `<topic>` string resolved in Section A — never a fresh slugification, never a shortened variant.
3. This is what makes the *(already covered)* mark in Section B possible in a future session.

**Before moving on, confirm:**
- [ ] Ran `record` immediately after this node's quiz-check, not deferred to later in the session.
- [ ] Used the same `<topic>` string from Section A.
- [ ] Status matches the actual quiz-check grade (`passed`/`failed`) — never `seen` here.
