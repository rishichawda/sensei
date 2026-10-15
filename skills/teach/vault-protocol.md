# Vault protocol

Sensei can save what the learner learns into their Obsidian vault. Two things are yours to do; a hook does the rest (every graded check is saved with its question, the answer given and whether it was right).

`<plugin-root>` is the folder you resolved for `mastery-ledger-protocol.md`. Never mention the vault commands, this file or any "saving" to the learner while a lesson runs; the only time the vault is mentioned is the one-time setup question in Section A.

## Section A — Offer the vault once (before the ledger lookup)

1. Run `node "<plugin-root>/scripts/vault.mjs" status`. It prints `{"configured":…,"declined":…}`, plus `"problem"` when a vault folder is set but cannot be used.
2. If `configured` is true, or `declined` is true, do nothing more here.
3. Otherwise ask once with `AskUserQuestion`, tagged `metadata: {source: JSON.stringify({app: "sensei-teach", v: 1, kind: "other"})}`. Question: "Want your lessons saved as notes in an Obsidian vault?" If `problem` is present, use "Your vault folder can't be used (<problem>). Want to set it up again so your lessons are saved as notes?" instead. Options (3, no "I don't know"): "Set up my vault", "Not now", "Don't ask again".
   - "Not now": carry on; ask again in a later session.
   - "Don't ask again": run `node "<plugin-root>/scripts/vault.mjs" decline`.
   - "Set up my vault": ask once more with `AskUserQuestion`, tagged the same way. Question: "Full path of your vault folder? Choose Other and type it." Options (2): "Not now", "Don't ask again" (handle them as above). When the learner types a path under Other, run `node "<plugin-root>/scripts/vault.mjs" setup "<path>"` and tell them in one plain sentence what it printed. If it says it could not save the setting, give them the instruction it printed, and carry on.
4. Then go on with `mastery-ledger-protocol.md` Section A.

## Section B — Save a digest of each explanation (Phase 3, before the check)

After you have written steps 1-3 (motivate, establish, connect) for the nodes of a chunk and before the check round, if `status` said `configured`, save one short digest per node with `Bash`, all commands in one call, one per line:

    node "<plugin-root>/scripts/vault.mjs" digest --topic <topic> --node <node-id> --kind explained <<'SENSEI_DIGEST'
    <two or three sentences: what the idea is, and the one connection to the node it rests on>
    SENSEI_DIGEST

Write the digest in your own words, in the learner's terms, no more than three sentences. It is a note to their future self, not a copy of your message. If a digest command fails or prints "not saved", ignore it and go on; never retry in a loop and never tell the learner.

After a miss, the hidden reminder that follows the learner's answer tells you the command for the re-explanation digest; run it in your next turn, before anything else.

## Section C — Write the card for each quiz-check (Phase 3, with the check)

If `status` said `configured`, add a `card` to each node item (or to the node tag, when the call has one question): `card: {q: "<question>", a: "<answer>"}`. The vault note keeps it as a flashcard, so the learner can recall the answer later without the options in front of them. Do not add `card` when no vault is configured.

- `q` must stand alone: it never says "which of these", "the options" or "above", and names the thing it asks about. Write it as an open question.
- `a` is the correct answer in a short phrase, in your own words, with the detail that makes it complete (a sentence at most). It is not the option letter.
- The card is for the same fact the quiz checks. Never put the learner's answer in it.

Example item: `{node: "coatings-fragile", recordAs: "graded", correct: "Leaving glasses on a hot car dashboard", card: {q: "What most often damages the thin coatings on a lens?", a: "Heat, such as a hot dashboard, and harsh chemicals"}}`.

A missing or malformed `card` is not an error for the learner: a malformed one makes the tag check deny the call, so fix it and retry; a missing one makes the note use the quiz question with its options.
