const IDK = "I don't know";
const SNIPPET_MAX = 80;

const pad = (n) => String(n).padStart(2, "0");
const squash = (text) => String(text).replace(/\s+/g, " ").trim();

export function sessionMarker(sessionId) {
  return `<!-- sensei:session ${sessionId} -->`;
}

export function sessionHeader(sessionId, now) {
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  return `\n## ${date} ${time}\n${sessionMarker(sessionId)}\n`;
}

export function lastSessionId(text) {
  const all = [...text.matchAll(/<!-- sensei:session (\S+) -->/g)];
  return all.length > 0 ? all[all.length - 1][1] : null;
}

export function newNoteText({ topic, node, requires }) {
  const links = requires.map((r) => `"[[sensei/${topic}/${r}|${r}]]"`).join(", ");
  return `---\ntopic: ${topic}\nnode: ${node}\nrequires: [${links}]\n---\n#flashcards/${topic}/${node}\n`;
}

// A multi-line card is "question", a line holding "?", "answer". Obsidian Spaced
// Repetition ends a card at a blank line, so blank lines inside the question are
// squashed when it is written and when it is compared.
export function cardBlock(question, answer) {
  const q = String(question).replace(/\n\s*\n/g, "\n").trim();
  return `${q}\n?\n${squash(answer)}\n`;
}

export function hasCard(text, question) {
  const target = squash(question);
  const parts = text.split("\n?\n");
  for (let i = 0; i < parts.length - 1; i++) {
    const cut = parts[i].lastIndexOf("\n\n");
    const asked = cut === -1 ? parts[i] : parts[i].slice(cut + 2);
    if (squash(asked) === target) return true;
  }
  return false;
}

function snippet(question) {
  const s = squash(question);
  return s.length > SNIPPET_MAX ? `${s.slice(0, SNIPPET_MAX)}…` : s;
}

export function attemptLine({ result, picked, question, answer, withCard }) {
  const where = withCard ? "" : ` on "${snippet(question)}"`;
  if (result === "passed") return `> ✓ Answered correctly${where}.`;
  if (picked === IDK) return `> Said "I don't know"${where}.`;
  const tail = withCard ? "Correct answer above." : `Correct answer: ${squash(answer)}`;
  return `> ✗ Picked "${squash(picked)}"${where}. ${tail}`;
}

export function checkText({ existing, question, answer, picked, result }) {
  const withCard = !hasCard(existing, question);
  const line = attemptLine({ result, picked, question, answer, withCard });
  return withCard ? `\n${cardBlock(question, answer)}\n${line}\n` : `\n${line}\n`;
}

export function digestText(kind, digest) {
  const label = kind === "re-explained" ? "Re-explained" : "Explained";
  return `\n**${label}:** ${String(digest).trim()}\n`;
}
