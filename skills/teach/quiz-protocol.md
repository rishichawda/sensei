# Quiz protocol (native AskUserQuestion, no custom tool)

There is no `quiz` tool — Claude Code's `AskUserQuestion` tool has no extension point for outside code to add grading logic, and the harness strips it from every subagent's tool set entirely — even if declared in frontmatter `tools:` — because a subagent must complete autonomously without blocking on user interaction. So grading is YOUR job, done in plain conversation, in the main session. Follow this protocol exactly every time you run a graded question.

**Step 4b's metadata tag is enforced on every `AskUserQuestion` call, not just quiz-shaped ones.** `hooks/teach/enforce-teach-tag.mjs` denies any `AskUserQuestion` call made without a valid `metadata.source` tag, once a teach session is active — this isn't limited to calls that carry the mandatory `"I don't know"` option (step 3, below); a plain non-graded question needs the `kind: "other"` shape (see `mastery-ledger-protocol.md`) just as much. If a call gets denied for this, the reason names exactly what's missing — attach it and retry the same call unchanged.

## Running a quiz question

1. **Decide the correct answer and write the explanation BEFORE calling the tool.** Hold both in your own working context — never put the correct answer in an option's label or description text (that would leak it visually before the user answers).
2. **Build the options with this construction procedure** — a post-hoc "keep them even" audit isn't enough on its own, since you write a good answer plus some throwaway wrongs and then don't re-scrutinise them; the tell is baked in before any check runs. Build them so evenness is automatic instead:
   - **(a) Every option is a bare claim — no justification anywhere.** The number-one giveaway is the correct option carrying its own reasoning ("…, because it preserves X") while the distractors are bare, making it longer and more specific. Put *zero* "why" in any option; all reasoning goes into your verdict message after they answer (step 6 below).
   - **(b) Write the correct claim first, then mutate it into each distractor.** Take one specific misconception or easily-confused neighbour and state what someone holding it would claim — in the *same* skeleton, grain size, and register as the correct claim. Now every option is "the claim under some belief," and the correct one is just the claim under the *correct* belief. Parallelism falls out by construction instead of being policed.
   - **(c)** Each distractor must still be a real error someone might actually make (so which one they pick is diagnostic), yet unambiguously wrong on the intended reading — tempting, not tricky.
   - **(d) No asymmetric bolding.** Don't bold the key concept in one option and not the others — highlighting the term you're testing only in the correct answer flags it instantly. Either bold nothing, or bold the parallel term in every option.

   If, reading the finished set cold, you can still tell which is right without knowing the material, you skipped (a) or (b) — regenerate, don't patch.

   `AskUserQuestion` accepts at most 4 options per question, and "I don't know" (step 3 below) always occupies one of them — so build **at most 3 real graded options** (fewer if you want more headroom).
3. **Always add one more option yourself**, worded exactly `"I don't know"`, appended after your real options. There is no automatic "I don't know" option here — you must add it explicitly every time.
4. **Call `AskUserQuestion`** with your question, the options (including "I don't know"), and `multiSelect: true` only if more than one option is genuinely correct.
4a. **If the question needs to show code, embed it as a real Markdown fenced code block with actual line breaks — never the two literal characters `\` and `n` typed as text.** Confirmed failure mode (not hypothetical): a live session asked several code-comprehension questions whose `question` text contained literal backslash-n sequences instead of real newlines — the code rendered as one unreadable run-on line or didn't render at all, and the user said so directly ("I don't see a code?", "the code is not formatted correctly. it is unreadable"). A control test confirmed the tool itself renders multi-line fenced code correctly when given genuine newline characters — this is a construction mistake, not a tool limitation, so get the construction right:
   ````
   What does calling `add(3, 2)` print?

   ```javascript
   function add(a, b) {
     console.log(a + b);
   }

   add(3, 2);
   ```
   ````
   That's a real triple-backtick fence with a real blank line before it and a real newline after every statement — not a description of one. If you're about to write `\n` as two characters inside the question text, stop: you want an actual line break there instead.
4b. **If this question is running inside a `teach` session, attach the ledger metadata to the same `AskUserQuestion` call** — not a follow-up call. Which shape depends on whether a node ID exists yet:
   - **Phase 1a probing (no dependency map yet, so no node ID exists):** `metadata: {source: JSON.stringify({app: "sensei-teach", v: 1, kind: "probe", topic: "<topic resolved in mastery-ledger-protocol.md Section A>"})}`. This is every probe question, without exception — it's what makes the session discoverable and resumable even if nothing gets past Phase 1a. No `node`/`correct`/`recordAs` — there's nothing to grade into a ledger coordinate yet.
   - **Phase 3 quiz-check (the node's ID was assigned back in Phase 2):** `metadata: {source: JSON.stringify({app: "sensei-teach", v: 1, kind: "node", topic: "<topic>", node: "<this node's ID>", recordAs: "graded", correct: "<the exact label text of the correct option, byte-for-byte>"})}`.

   Two hard constraints both shapes depend on:
   - **Single-select only** (`multiSelect: false` or omitted). Multi-select answers collapse into a comma-joined string that can't be graded reliably — if a concept genuinely needs more than one correct answer, split it into separate single-select questions rather than one multi-select call.
   - **One teach-graded node per `AskUserQuestion` call.** Never batch more than one teach-graded node's question into the same multi-question call — `metadata`/`answers` both key ambiguously across more than one node per call.
5. **When the tool returns the user's selection(s):**
   - If they picked "I don't know": this is a genuine knowledge gap, not a wrong guess. Say so plainly — do not treat it as incorrect.
   - Otherwise, compare their selection(s) against the correct answer you decided in step 1. For multi-select, it's correct only if they picked every correct option and no incorrect one.
6. **State the verdict yourself, in your own next message**, using this shape:
   - `✓ Correct.` or `✗ Incorrect.` (or, for "I don't know": state that plainly, no ✗)
   - The correct answer, named explicitly
   - The explanation you prepared in step 1

## Known limitations of this protocol

- **No automatic shuffling.** If option order matters for hygiene (not always putting the correct answer first), vary it yourself when you write the options.
- **No structured "note" field.** `AskUserQuestion` natively supports multi-select and an "Other" free-text option — you don't need to build either yourself — but "Other" returns unstructured free text, not a separate field alongside the graded verdict. If the user wants to add a comment, they'll do it via "Other" or in their next normal message — read it as you would any other reply.
- **No inline colorized ✓/✗ list.** The verdict lives in your prose reply, not in a rendered tool result.

## Non-graded questions

Non-graded preference/decision questions need no protocol — just call `AskUserQuestion` directly, the same way you would for any other clarifying question. Inside a `teach` session the only addition is the tag: attach `metadata: {source: JSON.stringify({app: "sensei-teach", v: 1, kind: "other"})}` (add `topic` once it's resolved), since the hook denies untagged calls.
