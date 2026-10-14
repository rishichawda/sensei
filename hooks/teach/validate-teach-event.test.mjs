import { test } from "node:test";
import assert from "node:assert/strict";
import { validateTeachEvent } from "./validate-teach-event.mjs";

const one = (...labels) => [{ question: "Q?", options: labels.map((label) => ({ label })) }];
const TAG = { app: "sensei-teach", v: 1 };
const PLAN = { nodes: ["a", "b", "c"], edges: [["a", "b"], ["b", "c"]] };

const probe = { ...TAG, kind: "probe", topic: "dns", correct: "B" };
const goal = { ...TAG, kind: "goal", topic: "dns", goal: "debug resolver failures" };
const node = { ...TAG, kind: "node", topic: "dns", node: "recursion", recordAs: "graded", correct: "B" };
const plan = { ...TAG, kind: "plan", topic: "dns", approve: "Looks good", plan: PLAN };
const wrap = { ...TAG, kind: "wrap", topic: "dns", done: "I'm done" };
const WRAP_OPTS = one("I'm done", "Learn something else");
const ABC = one("A", "B", "I don't know");
const APPROVE = one("Looks good", "I have changes");

const VALID = [
  ["probe", probe, ABC],
  ["goal", goal, ABC],
  ["node", node, ABC],
  ["plan", plan, APPROVE],
  ["wrap", wrap, WRAP_OPTS],
  ["plan with a single node and no edges", { ...plan, plan: { nodes: ["a"], edges: [] } }, APPROVE],
  ["other without topic", { ...TAG, kind: "other" }, ABC],
  ["other with topic", { ...TAG, kind: "other", topic: "dns" }, ABC],
  ["other with several questions", { ...TAG, kind: "other" }, [...ABC, ...ABC]],
  ["other with multi-select", { ...TAG, kind: "other" }, [{ question: "Q?", multiSelect: true, options: [{ label: "x" }] }]],
  ["other with no questions", { ...TAG, kind: "other" }, []],
  ["extra fields are allowed", { ...probe, note: "x" }, ABC],
  ["probe with a strand", { ...probe, strand: "heat" }, ABC],
  ["multiSelect false is single-select", { ...probe, correct: "A" }, [{ question: "Q?", multiSelect: false, options: [{ label: "A" }] }]],
];

for (const [name, event, questions] of VALID) {
  test(`valid: ${name}`, () => {
    assert.deepEqual(validateTeachEvent(event, questions), []);
  });
}

const multi = [...ABC, ...ABC];
const multiSelect = (labels) => [{ question: "Q?", multiSelect: true, options: labels.map((label) => ({ label })) }];

// [name, event, questions, regexes: one per expected problem, in order]
const INVALID = [
  ["v is 2", { ...probe, v: 2 }, ABC, [/^tag: v is 2/]],
  ["v is the string 1", { ...probe, v: "1" }, ABC, [/^tag: v is "1"/]],
  ["v missing", { app: "sensei-teach", kind: "probe", topic: "dns", correct: "B" }, ABC, [/^tag: v is undefined/]],
  ["unknown kind", { ...TAG, kind: "quiz" }, ABC, [/^tag: kind "quiz" is not one of probe, goal, node, plan, wrap, other/]],
  ["kind missing", { ...TAG }, ABC, [/^tag: kind undefined is not one of/]],

  ["probe without topic", { ...TAG, kind: "probe", correct: "B" }, ABC, [/^probe tag: topic must be a non-empty string/]],
  ["probe with empty topic", { ...probe, topic: "" }, ABC, [/^probe tag: topic must be a non-empty string/]],
  ["probe with non-string topic", { ...probe, topic: 4 }, ABC, [/^probe tag: topic must be a non-empty string/]],
  ["probe with an empty strand", { ...probe, strand: "" }, ABC, [/^probe tag: strand must be a non-empty string/]],
  ["probe with a whitespace-only strand", { ...probe, strand: "  \t" }, ABC, [/^probe tag: strand must be a non-empty string/]],
  ["probe with a zero-width-only strand", { ...probe, strand: "\u200b\ufeff" }, ABC, [/^probe tag: strand must be a non-empty string/]],
  ["probe with a number as strand", { ...probe, strand: 3 }, ABC, [/^probe tag: strand must be a non-empty string/]],
  ["probe with an array as strand", { ...probe, strand: ["heat"] }, ABC, [/^probe tag: strand must be a non-empty string/]],
  ["probe with a null strand", { ...probe, strand: null }, ABC, [/^probe tag: strand must be a non-empty string; name the prerequisite thread this question tests$/]],
  ["goal without goal", { ...goal, goal: undefined }, ABC, [/^goal tag: goal must be a non-empty string/]],
  ["goal without topic", { ...goal, topic: undefined }, ABC, [/^goal tag: topic must be a non-empty string/]],

  ["node without node", { ...node, node: undefined }, ABC, [/^node tag: node must be a non-empty string/]],
  ["node without topic", { ...node, topic: undefined }, ABC, [/^node tag: topic must be a non-empty string/]],
  ["node recordAs seen", { ...node, recordAs: "seen" }, ABC, [/^node tag: recordAs must be "graded"/]],
  ["node recordAs missing", { ...node, recordAs: undefined }, ABC, [/^node tag: recordAs must be "graded"/]],
  ["node correct matches no label", { ...node, correct: "Z" }, ABC, [/^node tag: correct "Z" matches none of the option labels \["A","B","I don't know"\]; set it to the exact label of the correct option$/]],
  ["node correct differs by case", { ...node, correct: "b" }, one("A", "B"), [/^node tag: correct "b" matches none/]],
  ["node correct differs by trailing space", { ...node, correct: "B " }, one("A", "B"), [/^node tag: correct "B " matches none/]],
  ["node correct missing", { ...node, correct: undefined }, ABC, [/^node tag: correct undefined matches none/]],
  ["node correct missing while an option has no label", { ...node, correct: undefined }, [{ question: "Q?", options: [{ description: "x" }, { label: "B" }] }], [/^node tag: correct undefined matches none/]],
  ["plan approve missing while an option has no label", { ...plan, approve: undefined }, [{ question: "Q?", options: [{ description: "x" }, { label: "Looks good" }] }], [/^plan tag: approve undefined matches none/]],
  ["node with options missing", { ...node }, [{ question: "Q?" }], [/^node tag: correct "B" matches none of the option labels \[\]/]],

  ["plan without topic", { ...plan, topic: undefined }, APPROVE, [/^plan tag: topic must be a non-empty string/]],
  ["plan approve matches no label", { ...plan, approve: "Yes" }, APPROVE, [/^plan tag: approve "Yes" matches none of the option labels \["Looks good","I have changes"\]/]],
  ["plan approve differs by case", { ...plan, approve: "looks good" }, APPROVE, [/^plan tag: approve "looks good" matches none/]],
  ["plan is not an object", { ...plan, plan: "a,b" }, APPROVE, [/^plan tag: plan must be an object with nodes and edges/]],
  ["plan is missing", { ...plan, plan: undefined }, APPROVE, [/^plan tag: plan must be an object with nodes and edges/]],
  ["plan.nodes empty", { ...plan, plan: { nodes: [], edges: [] } }, APPROVE, [/^plan tag: plan\.nodes must be a non-empty array of non-empty strings/]],
  ["plan.nodes not an array", { ...plan, plan: { nodes: "a", edges: [] } }, APPROVE, [/^plan tag: plan\.nodes must be a non-empty array of non-empty strings/]],
  ["plan.nodes holds a non-string", { ...plan, plan: { nodes: ["a", 2], edges: [] } }, APPROVE, [/^plan tag: plan\.nodes must be a non-empty array of non-empty strings/]],
  ["plan.nodes holds an empty string", { ...plan, plan: { nodes: ["a", ""], edges: [] } }, APPROVE, [/^plan tag: plan\.nodes must be a non-empty array of non-empty strings/]],
  ["plan.nodes has a duplicate", { ...plan, plan: { nodes: ["a", "a"], edges: [] } }, APPROVE, [/^plan tag: plan\.nodes lists "a" more than once/]],
  ["plan.nodes holds an id that is not a lowercase-hyphenated slug", { ...plan, plan: { nodes: ["a", "tcp_handshake"], edges: [] } }, APPROVE, [/^plan tag: plan\.nodes holds "tcp_handshake"; use a lowercase-hyphenated ID such as "tcp-handshake"/]],
  ["plan.edges missing", { ...plan, plan: { nodes: ["a"] } }, APPROVE, [/^plan tag: plan\.edges must be an array of \[from, to\] pairs/]],
  ["plan.edges entry is not a pair", { ...plan, plan: { nodes: ["a", "b"], edges: [["a", "b"], ["a"]] } }, APPROVE, [/^plan tag: plan\.edges\[1\] must be a \[from, to\] pair/]],
  ["plan.edges entry is not an array", { ...plan, plan: { nodes: ["a", "b"], edges: ["a-b"] } }, APPROVE, [/^plan tag: plan\.edges\[0\] must be a \[from, to\] pair/]],
  ["plan.edges refers to an unknown node", { ...plan, plan: { nodes: ["a", "b", "c"], edges: [["a", "b"], ["b", "c"], ["c", "foo"]] } }, APPROVE, [/^plan tag: plan\.edges\[2\] refers to "foo", which is not in plan\.nodes$/]],
  ["plan.edges refers to unknown nodes at both ends", { ...plan, plan: { nodes: ["a"], edges: [["x", "y"]] } }, APPROVE, [/refers to "x"/, /refers to "y"/]],
  ["plan.nodes holds an empty string and an edge refers to an unknown node", { ...plan, plan: { nodes: ["a", ""], edges: [["a", "zzz"]] } }, APPROVE, [/plan\.nodes must be a non-empty array/, /plan\.edges\[0\] refers to "zzz", which is not in plan\.nodes$/]],
  ["plan.nodes holds a non-string and an edge uses only valid nodes", { ...plan, plan: { nodes: ["a", "b", 2], edges: [["a", "b"]] } }, APPROVE, [/plan\.nodes must be a non-empty array/]],
  ["plan.nodes not an array leaves the edges unchecked", { ...plan, plan: { nodes: "a", edges: [["a", "zzz"]] } }, APPROVE, [/plan\.nodes must be a non-empty array/]],

  ["probe with 2 questions", probe, multi, [/^probe tag: call has 2 questions; send exactly one question per call, or put several questions in the call with an items array$/]],
  ["goal with 2 questions", goal, multi, [/^goal tag: call has 2 questions; send exactly one question per call$/]],
  ["node with 2 questions", node, multi, [/^node tag: call has 2 questions; send exactly one question per call, or put several questions in the call with an items array$/]],
  ["plan with 2 questions", plan, [...APPROVE, ...APPROVE], [/^plan tag: call has 2 questions; send exactly one question per call$/]],
  ["probe with zero questions", probe, [], [/^probe tag: call has 0 questions; send exactly one question per call, or put several questions in the call with an items array$/]],
  ["probe with questions not an array", probe, undefined, [/^probe tag: call has 0 questions/]],
  ["node with zero questions (label check skipped)", node, [], [/^node tag: call has 0 questions/]],
  ["probe multi-select", probe, multiSelect(["A", "B"]), [/^probe tag: question is multi-select; use a single-select question$/]],
  ["goal multi-select", goal, multiSelect(["A", "B"]), [/^goal tag: question is multi-select/]],
  ["node multi-select", node, multiSelect(["A", "B"]), [/^node tag: question is multi-select/]],
  ["plan multi-select", plan, multiSelect(["Looks good", "No"]), [/^plan tag: question is multi-select/]],

  ["wrap without topic", { ...wrap, topic: undefined }, WRAP_OPTS, [/^wrap tag: topic must be a non-empty string/]],
  ["wrap without done", { ...wrap, done: undefined }, WRAP_OPTS, [/^wrap tag: done undefined matches none of the option labels \["I'm done","Learn something else"\]/]],
  ["wrap done matches no label", { ...wrap, done: "Done" }, WRAP_OPTS, [/^wrap tag: done "Done" matches none of the option labels/]],
  ["wrap done differs by case", { ...wrap, done: "i'm done" }, WRAP_OPTS, [/^wrap tag: done "i'm done" matches none/]],
  ["wrap done missing while an option has no label", { ...wrap, done: undefined }, [{ question: "Q?", options: [{ description: "x" }, { label: "I'm done" }] }], [/^wrap tag: done undefined matches none/]],
  ["wrap with 2 questions", wrap, [...WRAP_OPTS, ...WRAP_OPTS], [/^wrap tag: call has 2 questions; send exactly one question per call$/]],
  ["wrap with zero questions", wrap, [], [/^wrap tag: call has 0 questions/]],
  ["wrap multi-select", wrap, multiSelect(["I'm done", "Other"]), [/^wrap tag: question is multi-select/]],
  ["probe without correct", { ...probe, correct: undefined }, ABC, [/^probe tag: correct undefined matches none of the option labels \["A","B","I don't know"\]; set it to the exact label of the correct option$/]],
  ["probe correct matches no label", { ...probe, correct: "Z" }, ABC, [/^probe tag: correct "Z" matches none of the option labels/]],
  ["probe correct differs by case", { ...probe, correct: "b" }, ABC, [/^probe tag: correct "b" matches none/]],
  ["probe correct differs by trailing space", { ...probe, correct: "B " }, ABC, [/^probe tag: correct "B " matches none/]],
  ["probe correct missing while an option has no label", { ...probe, correct: undefined }, [{ question: "Q?", options: [{ description: "x" }, { label: "B" }] }], [/^probe tag: correct undefined matches none/]],
  ["several problems are all reported in one pass", { ...node, topic: undefined, correct: "Z" }, multi, [/topic must be/, /call has 2 questions/, /correct "Z" matches none/]],
];

for (const [name, event, questions, expected] of INVALID) {
  test(`invalid: ${name}`, () => {
    const problems = validateTeachEvent(event, questions);
    assert.equal(problems.length, expected.length, `problems: ${JSON.stringify(problems)}`);
    expected.forEach((re) => assert.ok(problems.some((p) => re.test(p)), `no problem matches ${re} in ${JSON.stringify(problems)}`));
  });
}

test("never throws on odd input", () => {
  for (const event of [{}, { kind: "plan", v: 1 }, { kind: "node", v: 1, correct: {} }, null, undefined]) {
    for (const questions of [undefined, null, "x", 3, [null], [{}], [{ options: "x" }], [{ options: [null, {}] }]]) {
      assert.ok(Array.isArray(validateTeachEvent(event, questions)));
    }
  }
});

// A call with several questions: items align with questions by index.
const q = (question, ...labels) => ({ question, options: labels.map((label) => ({ label })) });
const TWO = [q("Q1?", "A", "B", "I don't know"), q("Q2?", "X", "Y", "I don't know")];
const nodeItems = { ...TAG, kind: "node", topic: "dns", items: [{ node: "n1", recordAs: "graded", correct: "B" }, { node: "n2", recordAs: "graded", correct: "X" }] };
const probeItems = { ...TAG, kind: "probe", topic: "dns", items: [{ correct: "B", strand: "heat" }, { correct: "Y" }] };

test("items: a node call with one item per question is valid", () => {
  assert.deepEqual(validateTeachEvent(nodeItems, TWO), []);
});

test("items: a probe call with one item per question is valid", () => {
  assert.deepEqual(validateTeachEvent(probeItems, TWO), []);
});

test("items: four questions are valid, five are denied", () => {
  const four = [1, 2, 3, 4].map((i) => q(`Q${i}?`, "A", "B"));
  const items = four.map((_, i) => ({ node: `n${i}`, recordAs: "graded", correct: "A" }));
  assert.deepEqual(validateTeachEvent({ ...nodeItems, items }, four), []);
  const five = [...four, q("Q5?", "A", "B")];
  const problems = validateTeachEvent({ ...nodeItems, items: [...items, { node: "n5", recordAs: "graded", correct: "A" }] }, five);
  assert.match(problems.join("; "), /at most 4/);
});

test("items: a count mismatch between items and questions is denied", () => {
  const problems = validateTeachEvent({ ...nodeItems, items: nodeItems.items.slice(0, 1) }, TWO);
  assert.match(problems.join("; "), /1 items but the call has 2 questions/);
});

test("items: a correct label missing from its own question is denied with the item index", () => {
  const bad = { ...nodeItems, items: [nodeItems.items[0], { node: "n2", recordAs: "graded", correct: "B" }] };
  assert.match(validateTeachEvent(bad, TWO).join("; "), /items\[1\].*"B"/);
});

test("items: a bad item is denied (node missing, recordAs wrong)", () => {
  const bad = { ...nodeItems, items: [{ recordAs: "seen", correct: "B" }, nodeItems.items[1]] };
  const text = validateTeachEvent(bad, TWO).join("; ");
  assert.match(text, /items\[0\].*node must be a non-empty string/);
  assert.match(text, /items\[0\].*recordAs must be "graded"/);
});

test("items: a multi-select question is denied", () => {
  const ms = [{ ...TWO[0], multiSelect: true }, TWO[1]];
  assert.match(validateTeachEvent(nodeItems, ms).join("; "), /multi-select/);
});

test("items: an empty or non-array items is denied", () => {
  assert.match(validateTeachEvent({ ...nodeItems, items: [] }, TWO).join("; "), /items/);
  assert.match(validateTeachEvent({ ...nodeItems, items: "x" }, TWO).join("; "), /items/);
});

test("items: a probe item with a blank strand is denied", () => {
  const bad = { ...probeItems, items: [{ correct: "B", strand: "  " }, probeItems.items[1]] };
  assert.match(validateTeachEvent(bad, TWO).join("; "), /items\[0\].*strand/);
});

test("items are not allowed on goal, plan, wrap or other tags", () => {
  for (const [event, qs] of [[goal, ABC], [plan, APPROVE], [wrap, WRAP_OPTS], [{ ...TAG, kind: "other" }, ABC]]) {
    assert.match(validateTeachEvent({ ...event, items: [{}] }, qs).join("; "), /items is only for/);
  }
});
