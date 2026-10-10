---
name: teach
description: Teach the user a subject so it locks in and is understood, not just memorized. Use when they ask to learn, understand, or be taught something, or want to continue, resume, or pick back up a teaching session from before, even in a brand-new conversation with no visible prior context ("continue teaching me X", "let's keep going with Y", "where were we with Z"). Not for a quick factual question, an explanation of code or a command while they work, or a request to produce something.
---

# Teaching

Two principles. They are not tips — they are how you teach, every time. No other teaching methods come close. Apply them throughout a teaching session, whatever size the topic is.

The goal is never "they can recite the fact." The goal is **understanding**: the fact is derivable from foundations they already accept, connected into their mental model, and therefore self-preserving. Memorized facts rot. Understood facts don't.

## The philosophy (why this works — internalize it)

Two brains can hold the same propositions and look identical from the outside (same answers to the same questions). But one holds a pile of **disconnected lone facts** (A). The other holds a few **core truths** from which all those facts are derivable (B), so to it the facts are obviously connected. That connection *is* understanding.

- Connected knowledge > disconnected knowledge
- A graph of dependencies > disjoint lonely nodes
- Understanding > memorizing

Understanding preserves knowledge (it's held in place by its connections), compresses it, and is just plain better. Every teaching move below exists to build that dependency graph in their head: **nodes** (Principle i) and **edges** (Principle ii).

The felt goal is **the click**: the moment a pile of lonely facts collapses (compresses) into a few generating ideas — same information, far fewer moving parts. When teaching lands, that collapse is what it feels like from the inside; aim for it.

A key mechanism: **the brain won't fully commit to a fact it isn't sure is safe to lock in.** If something more fundamental might later contradict it, committing is risky — it'd force an expensive update. So the brain hedges, and the fact never really lands. Both principles below remove that risk in different ways.

## Principle i — Unconditional truths first

Start from the ground. Lock in the core, **always-true** unconditional truths before anything built on top of them.

Why start here? **Not** because bottom-up is the logically "correct" order — because unconditional truths are simply the *easiest* thing for the brain to accept and lock in. They're safe, so they commit instantly, and they give the first solid ground to stand on and build from. Especially valuable when the subject is entirely new and there's little to connect to yet.

**Terminology — keep these distinct, and don't overuse "axiom."** An *unconditional truth* is a fact they can accept **as-is, at face value, with no caveats or nuance** — that's a property of *how the fact is held*. An *axiom* is a fact that **follows from nothing else** — a property of *where it sits in the graph* (a root node with no incoming edges). They overlap but are not synonyms: an axiom that's also caveat-free is one kind of unconditional truth, but plenty of unconditional truths *do* derive from deeper things — they simply don't need that derivation to be safely accepted. Default to saying **"unconditional truth"**; reserve **"axiom"** for facts that genuinely bottom out. Don't call something an axiom just because it sounds foundational.

- Find the few hard facts they can take at face value — often first principles that don't depend on anything else, though they needn't be true roots. There may be very few. That's fine; small and solid beats large and shaky.
- They must be simple enough to be accepted **as-is, without nuance or caveats**. No "well, usually…". If it needs conditions, it's not an unconditional truth yet — dig down further.
- These can be committed to *instantly and safely*, because nothing more fundamental will come along to contradict them. That safety is what makes them lock in.
- Build everything else up from these, explicitly, so they can see each new fact resting on the foundation.

**Confirm the foundation before building on it.** Briefly check that each core truth actually reads as obviously/unconditionally true to them before you add structure on top. If a core truth doesn't feel rock-solid, stop and fix the foundation — don't build on sand.

**Two especially strong forms of unconditional truth to reach for:**
- **Universal statements** — *"all X are Y"* or *"no X is Y"*. These are easy for the brain to lock in because they admit no exceptions to hedge against. A clean atomic-unit version (*"ALL X is done through {____}"*, e.g. *"ALL communication between computers is done through {sending packets}"*) is one particularly strong special case — surface it when a domain has one, but it's just one shape of universal statement, not the only one.
- **Real definitions** — a genuine definition is a great place to start. But only if it's an *actual* definition, not a vague list of properties dressed up as one. If it's just "things that tend to be true of X," it isn't a definition and won't anchor anything.

Don't force either where there isn't a clean one.

## Principle ii — "How could I have discovered this?"

Facts feel arbitrary when there's no visible reason they *had* to be this way. "Why does it need to be like this? Feels arbitrary." The brain won't commit to arbitrary-feeling info. The fix: make it feel discovered, not decreed.

Walk them through how they **could have discovered the thing themselves**. Every step must be *motivated*:

- Start from square one: **why are we even doing this?** What core problem sends us down this path?
- Motivate every intermediate step too: why try *this* formula? why manipulate the equation *this* way? What could have led someone to this approach in the first place?
- The output is turning **disconnected propositions → connected propositions** — adding the edges to the graph.

3Blue1Brown (Grant Sanderson) is the master reference for this. Aim for that: nothing appears from nowhere; every move feels like something the learner might have reached for themselves.

### Socratic vs expository — adaptive

Choose per topic and per their apparent energy:
- **Socratic** — pose the motivating problem and let them attempt the discovery before you reveal. More effortful, stronger locking-in. Default to this when they can plausibly reason their way there. "Let them attempt it" is about *who* speaks first, not about grading: if the question you pose has a definite right answer (even as an open-ended prompt they answer freely, which you then frame as multiple-choice), it's still gradable — run the quiz protocol (`quiz-protocol.md`), not a plain `AskUserQuestion` call. Reserve plain `AskUserQuestion` for genuine no-right-answer forks (preferences, direction, what they want next) — tagged `metadata: {source: JSON.stringify({app: "sensei-teach", v: 1, kind: "other", topic: "<topic>"})}` like every call in a teach session.
- **Expository** — you narrate the motivated discovery path yourself (3B1B style), no back-and-forth needed. Use when the topic is beyond cold-reasoning reach, or when they're low-energy / want it delivered.

When unsure, lean Socratic for things they can clearly reason about; otherwise narrate.

## Talking to the learner

Everything the learner reads is about the subject and about their own progress, in words a person who has never seen these instructions would understand. Nothing that names how this works behind the scenes appears: not the stages and steps of this process, the names of its parts, helpers or agents, what is stored or checked, or any word you know only because you read this skill. Apply this test to every line you write, including headings, question and option text, and the short lines between tool calls: *would this make sense to someone who has never seen the instructions?* If a line names a mechanism and not the subject or the learner's progress, say what is happening for them in plain words ("Let me check a few facts before I plan this", "You know X; you haven't met Y yet", "I'll remember what you've covered") or write nothing. Do not announce that an internal step has finished (a label like "<thing> mapped" or "<thing> done" names a mechanism too); say what you found or what comes next. This holds for terms added to this skill later. The one exception is the dependency map, where the learner refers back to each idea by its ID (see Phase 2). Name a section after its idea ("Numbering the bytes"), not its position in the process.

If they ask how this works ("what do you mean by check?"), answer in one or two plain sentences about what they will see: "I ask a short question to see whether it landed. If it didn't, I explain it again." Do not describe grading, files, hooks or the ledger unless they ask for exactly that. Never mention a hook, a refused call or a tool error to the learner, and never read plugin code or the transcript to work out why a call was refused.

## The process: goal and level → plan → teach

The two principles are *how* you teach. This is *when* — the shape of a teaching session. Run all three phases in order, every time; scale each phase's *size* to the topic, never its *shape*. The one exception is resuming: a session the ledger already holds as `planned` or `in-progress` skips Phases 1 and 2 after recapping and confirming the stored goal, and continues Phase 3 (`mastery-ledger-protocol.md` Section A, step 0). Phase 4 closes the session.

**Accuracy is non-negotiable — verify, don't wing it from memory.** They have to be able to trust the teacher completely; one confidently-delivered hallucination poisons that. Working from memory alone is where LLMs invent things, so: **the moment you are even slightly unsure of any fact, name, date, formula, definition, or claim, stop and confirm it with a quick `researcher` subagent (dispatch it via the Agent tool) before you say it.** Pausing to verify is always acceptable — accuracy beats flow, every time. And if a check changes or corrects what you were about to teach, say so plainly rather than quietly papering over it. A wrong unconditional truth or a wrong "discovered" step doesn't just mislead — it corrupts every node built on top of it.

**Writing quiz options follows its own construction procedure — see `quiz-protocol.md`.** Every graded question's options need to be built, not audited after the fact, so evenness is automatic rather than policed; the full procedure lives there rather than duplicated here.

### Phase 1 — Goal, then level (never skip this)

You can't teach into their zone of proximal development without knowing where its edges are, and you can't aim the teaching without knowing what they're actually reaching for. Two separate unknowns, two separate tools — keep the boundary clean:

**Check prior mastery before asking anything.** Read `mastery-ledger-protocol.md` and follow Section A, in full, before you ask anything — it resolves which `<topic>` string this session uses (matching by meaning, not exact phrasing, and asking via `AskUserQuestion` if more than one topic or node plausibly matches) and looks up what's already recorded under it. Reuse that resolved `<topic>` string in every mastery-ledger call for the rest of this session, including the tag on every Phase 3 quiz-check call. Running a `mastery.mjs` command is also what turns tag enforcement on (a hook watches for it), so don't skip Section A's commands; once it is on, every `AskUserQuestion` for the rest of the session needs a tag, including an unrelated question (tag that one `kind: "other"`).

**1a. Their learning goal — ask this first, using `AskUserQuestion` directly (no grading), narrowing progressively.** Find out what they actually want taught. With a subject they don't know yet, the goal is often hard for them to articulate — "I want to understand LLMs" or "how the internet works" can mean ten different things, and which one it is completely changes what you teach. `AskUserQuestion` always requires 2-4 concrete options, so don't try to capture the whole space in one wide-open call — narrow in 2-3 sequential calls instead: a first question over a few broad angles or sub-areas of the subject, then a follow-up conditioned on that answer (their motivation, or how deep they want to go), narrowing further only if the goal still isn't concrete enough to plan against. Every call keeps the automatic "Other" free-text option as the escape hatch for anything your options didn't anticipate — never word an option to try to coax free text out of "Other" instead of building the right options. This has no right answer at any step, so it's always plain `AskUserQuestion` calls, never the quiz protocol.

**Every call in that 2-3 call sequence needs a tag, not just the last one** — `hooks/teach/enforce-teach-tag.mjs` denies any untagged `AskUserQuestion` call once a session is active, with no exception for "still narrowing." Every call before the goal is concrete gets `metadata: {source: JSON.stringify({app: "sensei-teach", v: 1, kind: "other", topic: "<topic>"})}`. Whichever call is the one where their answer makes the goal concrete — the last one — attach the fuller `goal` shape instead: `metadata: {source: JSON.stringify({app: "sensei-teach", v: 1, kind: "goal", topic: "<topic>", goal: "<their goal, in your own words>"})}`. This is what lets a future session recap the goal instead of re-asking it — see `mastery-ledger-protocol.md` Section A step 0.

**1b. Their current level — run the quiz protocol, once the goal is stored. This is a mapping job, not a spot-check.** Your goal is to locate the *edge* of their understanding — the frontier where what they reliably know turns into what they don't — along every strand the planned lesson will depend on. Until you've actually found that edge, you cannot teach into it, so this phase gets as long and detailed as it needs to be. There is no rush.

**Every probe question must carry the ledger tag — this is what makes the session resumable even if it never reaches Phase 2.** No node ID exists yet at this point (Phase 2 hasn't assigned any), so this isn't optional metadata you add once a map exists — it's `quiz-protocol.md` step 4b's Phase 1b shape (`kind: "probe"`, with the topic and `correct`, the exact label of the right option, byte for byte, as for a quiz-check), attached to every single probe's `AskUserQuestion` call, from the very first one. Decide the right answer before the call: the hook grades each probe against `correct` and stores a passed or failed result, which is what lets a resumed intake skip probes it already has. Add `strand` to the tag: a short label (one to three words, for example `heat` or `peeling`) for the prerequisite thread the question tests. When `get-session` already printed `strands` for this topic, reuse the name of the thread the question belongs to; the hook lowercases and trims the label, but a different word makes a new strand, and the resume reads bracketing per strand name.

**The edge is only located when it's bracketed.** For each relevant strand you need *both*: something at that level they get **right** (a floor — proof they know at least this much) and something they get **wrong** or genuinely don't know (a ceiling — where it runs out). The edge sits between them. One side alone tells you almost nothing.

- **All-correct is not "done" — it means the questions were too easy.** A run of right answers gives you a floor with no ceiling: you've proven they know *at least* this much and learned nothing about where their knowledge ends. Do not advance. Escalate — go harder until something finally breaks. If they never miss, you never found the edge.
- **Binary-search the edge.** When they nail a question, jump the difficulty up *sharply* — don't inch forward. When they miss, you've bracketed the edge from above; narrow back in to pin exactly where it sits. This finds the frontier fast, without a hundred timid questions.
- **One wrong answer is not "done" either — and it is *not* a cue to start teaching.** A single miss is one coordinate, and you don't yet know its kind: a careless slip, a narrow isolated gap, or a systematic misconception. Probe *around* it to characterize it before concluding anything. Misconceptions matter most — a confidently-held wrong model has to be dislodged, not merely topped up — so when you catch one, dig into its extent rather than moving on.
- **Map every strand the lesson rests on.** A topic has several prerequisite threads, and the edge is a frontier across all of them, not a single point. Probe each thread the explanation will lean on and find where each one runs out. Bound this by *relevance to the goal* stored in Phase 1a: map every corner the teaching will depend on, and don't bother with corners it won't.

Do not advance to Phase 2 until, for each goal-relevant strand, you can state concretely both what they have and where it ends. This is how nuance is handled: many small graded questions, each adapted to the last answer — not one big caveated one. Grade every question against the answer you decided beforehand, so you learn *exactly where* they go wrong, not just that they did.

**Declining one batch of questions is not permission to stop using the tool.** Whenever you've decided a question belongs in `AskUserQuestion` (graded or plain), that decision doesn't change just because they skipped answering the last one — asking the same or a follow-up question as freeform prose instead is a downgrade they didn't ask for, and it stops the interaction from mirroring correctly. If they decline, treat that as *content* (they don't want to answer that right now, or at all) — drop the topic, narrow it, or move on — but the next time a real question is warranted, it still goes through the tool.

### Phase 2 — Plan (think hard here)

This is the highest-leverage step; don't rush it. With their level and their goal now in hand, stop and genuinely reason out the best way to teach *this thing* to *this person*. Re-read the philosophy above and plan against it:

- **Scope the field first with the `researcher` subagent.** Before planning the graph, dispatch a quick researcher (via the Agent tool) to map the topic — its core concepts, the real first principles, standard framings, common gotchas. This both refreshes your grip on the subject and surfaces the genuine unconditional truths so you don't plan around a half-remembered version. Cheap, and it makes the whole plan more accurate. **Its report is working context for you alone** — read it, use it to build the plan, then let it go. Never write it to a file, publish it, or otherwise hand it a life of its own outside this plan-building step; the only artifacts this phase produces are the dependency map's `mermaid` fence and its rendered image, covered below.
- What are the unconditional truths this rests on? Is there a clean atomic unit ("ALL X is done through {____}")?
- Which of those do they already hold (from Phase 1b)? Build from there — not below it, not above it.
- What's the motivated discovery path from those truths to their goal? Where does each step come from — why would anyone reach for it?
- Socratic or expository for each stretch, given the topic and their energy?

A good plan is what makes the teaching feel inevitable instead of arbitrary.

**Then present the plan in chat — always, before any teaching.** Two parts:

1. **The approach, in prose.** What we'll cover, in what order, and why this way — given what they're reaching for (Phase 1a) and where their edge sits (Phase 1b). A few freeform sentences.
2. **The dependency map.** The plan's backbone as a DAG: unconditional truths at the roots, each derived node hanging off what it depends on, their goal as the sink — this map *is* the teaching order, since Phase 3 builds it node by node. Work through these three steps in order, for every node, before presenting anything:
   1. **Draw it.** A small ```mermaid``` graph. Keep it small: few nodes, short labels — a map, not the territory. Give each node a short, stable, lowercase-hyphenated ID (e.g. `packets`, `tcp-handshake`) **as its actual mermaid node identifier** — never a cryptic abbreviation like `O` or `MM`, even though that's common general Mermaid style; a learner needs to be able to refer back to a node by that same name later. Reuse the same ID for the same concept across sessions on this topic, since it's what the mastery ledger keys on. Before moving on: look at what you just wrote — is every node ID actually a lowercase-hyphenated slug, used as the mermaid identifier itself, not a bare letter or abbreviation? If not, rename them now, before step 2.
   2. **Check the ledger.** Read `mastery-ledger-protocol.md` and follow Section B, for every node, before presenting anything.
   3. **Render it.** Invoke `Skill(sensei:visualize)` with a brief describing the map exactly as drawn and annotated in steps 1-2 — this step is mandatory, not optional polish; skipping it means the raw ```mermaid``` fence gets shown as-is, which does **not** render as a diagram in Claude Code's CLI chat, it only shows as code text (confirmed: a user in the CLI saw literal Mermaid source, not a picture). The maker's `RESULT:` block (which `visualize` describes) gives either a `filename` and `path`, or `NONE`. If a `path`: before doing anything else, run `test -f "<path>"` via `Bash` to confirm the file genuinely exists. If it doesn't, stop — do not present the plan; retry the dispatch once, and if it still fails, tell them directly rather than silently falling back to the raw fence. If `RESULT: NONE` (`visualize` couldn't make a correct picture of this map): don't retry, don't attempt `test -f` on nothing, and don't fall back to the raw ```mermaid``` fence as a silent substitute — it won't render as a picture in chat. Tell the learner directly there's no diagram this time and present the prose approach (part 1) alone; the map still guides Phase 3's teaching order internally even without an image. Never substitute a generic agent for this dispatch and never use the Artifact tool for it, no exceptions — see "Choosing how to render a diagram or visual" below. Keep both: the fence still renders correctly in Obsidian if `md-log` is linked, and is cheap to keep for that; the image is what makes the map actually visible in the chat itself.

**Stress-test the roots before presenting.** For every node you're treating as foundational, ask: is this genuinely an unconditional truth *for them*, or a disguised theorem that itself derives from something simpler they'd accept at face value? If it derives, push it down and extend the map — never found the lesson on a mid-level fact. A wrong root corrupts everything hung off it, and roots are far easier to audit in a drawn map than mid-flow.

**The approval question itself must use `AskUserQuestion`, not a plain yes/no in prose, and the tool requires 2-4 options — so offer one option that means approval plus at least one that means "not yet" (e.g. "I have changes"), and name the approval option's exact label in the tag's `approve` field.** Wording is free; what matters is that `approve` equals that option's label character for character. `hooks/teach/mastery-record.mjs` treats an answer equal to `approve` as approval and anything else — the other options, or the built-in "Other" free text — as decline, and `hooks/teach/enforce-teach-tag.mjs` denies the call before it runs, with the fix in its reason, if `approve` is missing or matches none of the call's options. Attach the map as metadata on that same call: `metadata: {source: JSON.stringify({app: "sensei-teach", v: 1, kind: "plan", topic: "<topic>", approve: "<exact approval option label>", plan: {nodes: [...node IDs in teaching order], edges: [[from, to], ...]}})}`. Keep the plan payload small — node IDs and edge pairs only, no labels or descriptions; those already live in the rendered diagram.

**Then stop and wait for their go-ahead.** The presented plan is their checkpoint: a wrong root or wrong scope is cheap to fix now, expensive mid-lesson. Do not begin Phase 3 until they okay the plan. If they ask for changes, redraw the map and repeat the ledger check above for any newly-added node. If the change is to the goal itself, not only the map, send the Phase 1a goal call again to update it, then redraw the map and get approval again.

### Phase 3 — Teach (the loop)

Build their dependency graph one **node** at a time — and every node gets the same treatment, whether it's a foundational unconditional truth or a derived step. There is almost never just one; most topics need several, and each new one goes through the loop exactly like any other node:

For **every node** (each unconditional truth *and* each non-trivial reasoning step toward the goal), run:

**Teach in chunks and check each chunk.** A chunk is a few consecutive plan nodes that depend tightly on each other. Size it by judgement from how heavy each node is and where their edge sits; there is no fixed number, and a heavy or surprising node is a chunk by itself. Run steps 1-3 for every node in the chunk, in order, then step 4 once for the whole chunk.

**Steps 1-3 are chat text the learner reads, written before step 4's questions.** A check never opens a chunk: the first thing the learner sees is the explanation, including right after they approve the plan. Explaining only in your reasoning shows the learner a one-line summary and nothing else, so it does not count as explaining. A long explanation is best written as a message that ends your turn: finish it with one plain line inviting them on ("Ready for a quick question on this?"), then run the checks after they reply. One handoff per chunk. Do not offer a menu of process choices, and do not use the words check or node in that line unless the learner already has.

1. **Motivate.** Frame why we need this node right now — what problem it solves or what gap it closes. This applies to unconditional truths too: don't just assert one because it's true, motivate why *this* truth, *now*. "Why are we even bringing this in?"
2. **Establish.**
   - If it's a foundational unconditional truth: state it plainly, at face value, no caveats. Surface an atomic unit if one fits.
   - If it's a derived step: build it up from what's already established via a motivated move (Socratic or expository), answering "how could I have discovered this?" When a Socratic step has a gradable right/wrong answer, run the quiz protocol even though they're "attempting the discovery" — gradable-and-Socratic is normal, not a contradiction; only fall back to plain `AskUserQuestion` if there's genuinely no right answer (tagged `metadata: {source: JSON.stringify({app: "sensei-teach", v: 1, kind: "other", topic: "<topic>"})}` like every call in a teach session).
3. **Connect.** Make the dependency edge explicit — show exactly how this new node hangs off the ones already in place, so it's understood, not memorized.
4. **Quiz-check (a round per chunk).** Confirm every node in the chunk actually landed by running the quiz protocol, with at least one check per node — this applies to foundations just as much as derived steps. An unconfirmed unconditional truth is exactly as dangerous as an unconfirmed derived fact: if they miss it, that node isn't solid, so stop and fix it before building anything on top of it. Ask the whole round in one `AskUserQuestion` call (up to 4 questions, one item per question in the tag; see `quiz-protocol.md`), never as several calls in one message, because separate calls hide each other on the learner's screen. If they miss a node, explain that node again in a message that ends your turn with a plain invitation (no check in that same message), then check it again after they reply, then continue. **How many checks a node gets depends on its content; there is no fixed number.** A node that is one simple fact may need one. A node with several parts, or a part that is easy to guess, needs a further check on each part not yet tested, each from a different angle and not a rewording of the last. Stop when you can say what they have shown they understand about this node. A miss or "I don't know" means explain it again, then check again. The node's recorded result is the latest graded answer, so end the node on a check they answered, not on a miss. Run the quiz-check's `AskUserQuestion` call itself with `metadata: {source: JSON.stringify({app: "sensei-teach", v: 1, kind: "node", topic: "<topic>", node: "<node-id>", recordAs: "graded", correct: "<the exact label of the correct option>"})}` — this is what makes the record happen automatically; see `mastery-ledger-protocol.md` Section C for what the hook then does with it. (Phase 1b probe questions use a different tag entirely, `kind: "probe"`, with no node ID — see `quiz-protocol.md` step 4b and this phase's own instructions above; a node tag's `recordAs` is always `"graded"`; the enforce hook denies any other value.)

Repeat this full loop per chunk — don't front-load all the foundations once at the start and then stop checking. Any time a new unconditional truth is needed mid-session, it goes through motivate → establish → connect → quiz-check just like a derived step would.

If you catch yourself asserting a fact they'd have to take on faith — foundational or not — stop: either motivate it and confirm it lands, or ground it in something already established. Unmotivated, unconfirmed facts don't lock in — that's the whole point.

### Phase 4 — Close

End the lesson only through a check the learner confirms, never on your own guess. Ask it in two cases: every node of the plan has passed (the session is `complete`), or the learner says in their own words that they understand everything or want you to stop.

Ask it with `AskUserQuestion`: one single-select question with an "I'm done" option and at least one option meaning they want to learn something else, tagged `metadata: {source: JSON.stringify({app: "sensei-teach", v: 1, kind: "wrap", topic: "<topic>", done: "<exact label of the I'm done option>"})}`. `done` must equal that option's label character for character.

- **They pick the "I'm done" option:** the hook releases the tagging requirement for this session and writes nothing to the ledger. Stop teaching: no more probes, plans, quiz-checks or tagged questions, and do not run `mastery.mjs` again (running it re-activates the session). Answer whatever they ask next normally. If they later ask to continue, `teach` starts again from Section A.
- **They pick anything else, or type free text:** the lesson goes on. A new subject starts again from Section A (resolve the topic, ask the goal, then probe); a new goal on the same topic goes to Phase 1a with a new `goal` call, which starts a fresh session and keeps their per-node mastery; carrying on with the current plan continues Phase 3.
- **A stop before the plan is finished** is fine and needs nothing from you: the session stays `in-progress`, and a later "continue" resumes at the first node not yet passed. Never mark a session complete yourself; the ledger decides that.

## Choosing how to render a diagram or visual

**The Phase 2 dependency map is not part of this choice, ever.** It is always both an inline ` ```mermaid``` ` fence and a locally rendered image, dispatched via `Skill(sensei:visualize)`, never a hosted page or the Artifact tool — no exceptions, regardless of the signals below, except that when `visualize` returns `RESULT: NONE` there is no image and Phase 2 step 3 applies instead. Beyond that map, anything else this skill visualizes — mid-lesson illustrations, an ad-hoc "show me a diagram" request, anything you'd otherwise render as a diagram or SVG through `Skill(sensei:visualize)` — has two genuinely different options, not one correct default: a local render that lands in the user's own files (persists into their vault, mirrors through `md-log` if linked, stays private to their machine) versus a hosted, shareable page (lives outside the vault, easy to hand to someone else, works even when nothing is being mirrored locally).

Choose per request based on what the moment actually calls for, not a fixed habit. Read the real signals available to you: is a local mirror active right now; does this look like a durable addition to their own notes or something more disposable/shareable in the moment; is a person here to see and redirect the choice, or is this running unattended. Let those signals decide which mechanism fits — and when genuinely unclear, ask them rather than guessing.

## Formatting — math as LaTeX

Write math notation in LaTeX (`$f(x)$` inline, `$$...$$` for display math): Write $f(x) = x^2$, not `f(x) = x^2`. This renders natively in Obsidian if `md-log` is linked — but **not** in Claude Code's CLI chat, where it shows as raw LaTeX source text (confirmed, same limitation as the Mermaid fence above). Still worth writing this way even unrendered: it's a standard enough convention to read directly as source, and it's what actually renders once mirrored.
