import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sessionMarker, sessionHeader, lastSessionId, newNoteText, hasCard, cardBlock, attemptLine, checkText, digestText,
} from "./note.mjs";

test("sessionHeader uses local date and time and carries the marker", () => {
  const header = sessionHeader("s1", new Date(2026, 9, 13, 14, 5));
  assert.equal(header, `\n## 2026-10-13 14:05\n${sessionMarker("s1")}\n`);
});

test("lastSessionId returns the last marker or null", () => {
  assert.equal(lastSessionId("no markers here"), null);
  assert.equal(lastSessionId(`${sessionMarker("a")}\ntext\n${sessionMarker("b-2")}\n`), "b-2");
});

test("newNoteText has frontmatter with wikilinks to prerequisites and the deck tag line", () => {
  const text = newNoteText({ topic: "dns", node: "recursive-resolver", requires: ["referrals"] });
  assert.equal(
    text,
    '---\ntopic: dns\nnode: recursive-resolver\nrequires: ["[[sensei/dns/referrals|referrals]]"]\n---\n#flashcards/dns/recursive-resolver\n',
  );
  assert.match(newNoteText({ topic: "dns", node: "ip", requires: [] }), /requires: \[\]\n/);
});

test("cardBlock writes a multi-line card and squashes blank lines inside the question", () => {
  const question = "What prints?\n\n```js\nconsole.log(1)\n\nconsole.log(2)\n```";
  assert.equal(cardBlock(question, "1\nthen 2"), "What prints?\n```js\nconsole.log(1)\nconsole.log(2)\n```\n?\n1 then 2\n");
});

test("hasCard finds a card by its question, ignoring whitespace, and ignores answers", () => {
  const card = cardBlock("What does a resolver\ndo on a miss?", "It asks root");
  const text = `---\n---\n#flashcards/dns/x\n\n## 2026-10-13 14:05\n${sessionMarker("s1")}\n\n${card}\n> ✓ Answered correctly.\n`;
  assert.equal(hasCard(text, "What does a resolver do on a miss?"), true);
  assert.equal(hasCard(text, "It asks root"), false);
  assert.equal(hasCard(text, "Something else?"), false);
});

test("hasCard still matches after Obsidian appends its schedule comment to the answer", () => {
  const card = cardBlock("Q one?", "A one").replace("A one\n", "A one <!--SR:!2026-10-20,4,270-->\n");
  assert.equal(hasCard(`intro\n\n${card}`, "Q one?"), true);
});

test("hasCard recognises a question that had blank lines and a code fence", () => {
  const question = "What prints?\n\n```js\nf()\n\ng()\n```";
  const text = `\n\n${cardBlock(question, "x")}`;
  assert.equal(hasCard(text, question), true);
});

test("attemptLine covers correct, wrong, I don't know, with and without the card just written", () => {
  assert.equal(attemptLine({ result: "passed", withCard: true }), "> ✓ Answered correctly.");
  assert.equal(
    attemptLine({ result: "failed", picked: "Only root", withCard: true }),
    '> ✗ Picked "Only root". Correct answer above.',
  );
  assert.equal(attemptLine({ result: "failed", picked: "I don't know", withCard: true }), '> Said "I don\'t know".');
  assert.equal(
    attemptLine({ result: "failed", picked: "Only root", question: "What now?", answer: "Ask TLD", withCard: false }),
    '> ✗ Picked "Only root" on "What now?". Correct answer: Ask TLD',
  );
  assert.equal(
    attemptLine({ result: "passed", question: "What now?", withCard: false }),
    '> ✓ Answered correctly on "What now?".',
  );
});

test("attemptLine keeps free text on one line and shortens a long question", () => {
  const line = attemptLine({ result: "failed", picked: "line one\nline two", question: "q".repeat(120), answer: "a", withCard: false });
  assert.ok(!line.includes("\n"));
  assert.ok(line.includes('"line one line two"'));
  assert.ok(line.includes(`${"q".repeat(80)}…`));
});

test("checkText adds the card on first sight and only the attempt on a re-ask", () => {
  const first = checkText({ existing: "", question: "Q?", answer: "A", picked: "A", result: "passed" });
  assert.equal(first, "\nQ?\n?\nA\n\n> ✓ Answered correctly.\n");
  const again = checkText({ existing: `x\n\n${cardBlock("Q?", "A")}`, question: "Q?", answer: "A", picked: "B", result: "failed" });
  assert.equal(again, '\n> ✗ Picked "B" on "Q?". Correct answer: A\n');
});

test("digestText labels explained and re-explained digests", () => {
  assert.equal(digestText("explained", "  The resolver walks the tree.  "), "\n**Explained:** The resolver walks the tree.\n");
  assert.equal(digestText("re-explained", "It does not stop at root."), "\n**Re-explained:** It does not stop at root.\n");
});
