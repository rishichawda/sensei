import { test } from "node:test";
import assert from "node:assert/strict";
import { validateTeachEvent } from "./validate-teach-event.mjs";

const one = (...labels) => [{ question: "Q?", options: labels.map((label) => ({ label })) }];
const TAG = { app: "sensei-teach", v: 1 };
const PLAN = { nodes: ["a", "b", "c"], edges: [["a", "b"], ["b", "c"]] };

const probe = { ...TAG, kind: "probe", topic: "dns" };
const goal = { ...TAG, kind: "goal", topic: "dns", goal: "debug resolver failures" };
const node = { ...TAG, kind: "node", topic: "dns", node: "recursion", recordAs: "graded", correct: "B" };
const plan = { ...TAG, kind: "plan", topic: "dns", approve: "Looks good", plan: PLAN };
const ABC = one("A", "B", "I don't know");
const APPROVE = one("Looks good", "I have changes");

const VALID = [
  ["probe", probe, ABC],
  ["goal", goal, ABC],
  ["node", node, ABC],
  ["plan", plan, APPROVE],
  ["plan with a single node and no edges", { ...plan, plan: { nodes: ["a"], edges: [] } }, APPROVE],
  ["other without topic", { ...TAG, kind: "other" }, ABC],
  ["other with topic", { ...TAG, kind: "other", topic: "dns" }, ABC],
  ["other with several questions", { ...TAG, kind: "other" }, [...ABC, ...ABC]],
  ["other with multi-select", { ...TAG, kind: "other" }, [{ question: "Q?", multiSelect: true, options: [{ label: "x" }] }]],
  ["other with no questions", { ...TAG, kind: "other" }, []],
  ["extra fields are allowed", { ...probe, note: "x" }, ABC],
  ["multiSelect false is single-select", probe, [{ question: "Q?", multiSelect: false, options: [{ label: "A" }] }]],
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
  ["v missing", { app: "sensei-teach", kind: "probe", topic: "dns" }, ABC, [/^tag: v is undefined/]],
  ["unknown kind", { ...TAG, kind: "quiz" }, ABC, [/^tag: kind "quiz" is not one of probe, goal, node, plan, other/]],
  ["kind missing", { ...TAG }, ABC, [/^tag: kind undefined is not one of/]],

  ["probe without topic", { ...TAG, kind: "probe" }, ABC, [/^probe tag: topic must be a non-empty string/]],
  ["probe with empty topic", { ...probe, topic: "" }, ABC, [/^probe tag: topic must be a non-empty string/]],
  ["probe with non-string topic", { ...probe, topic: 4 }, ABC, [/^probe tag: topic must be a non-empty string/]],
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
  ["plan.edges missing", { ...plan, plan: { nodes: ["a"] } }, APPROVE, [/^plan tag: plan\.edges must be an array of \[from, to\] pairs/]],
  ["plan.edges entry is not a pair", { ...plan, plan: { nodes: ["a", "b"], edges: [["a", "b"], ["a"]] } }, APPROVE, [/^plan tag: plan\.edges\[1\] must be a \[from, to\] pair/]],
  ["plan.edges entry is not an array", { ...plan, plan: { nodes: ["a", "b"], edges: ["a-b"] } }, APPROVE, [/^plan tag: plan\.edges\[0\] must be a \[from, to\] pair/]],
  ["plan.edges refers to an unknown node", { ...plan, plan: { nodes: ["a", "b", "c"], edges: [["a", "b"], ["b", "c"], ["c", "foo"]] } }, APPROVE, [/^plan tag: plan\.edges\[2\] refers to "foo", which is not in plan\.nodes$/]],
  ["plan.edges refers to unknown nodes at both ends", { ...plan, plan: { nodes: ["a"], edges: [["x", "y"]] } }, APPROVE, [/refers to "x"/, /refers to "y"/]],

  ["probe with 2 questions", probe, multi, [/^probe tag: call has 2 questions; send exactly one question per call$/]],
  ["goal with 2 questions", goal, multi, [/^goal tag: call has 2 questions; send exactly one question per call$/]],
  ["node with 2 questions", node, multi, [/^node tag: call has 2 questions; send exactly one question per call$/]],
  ["plan with 2 questions", plan, [...APPROVE, ...APPROVE], [/^plan tag: call has 2 questions; send exactly one question per call$/]],
  ["probe with zero questions", probe, [], [/^probe tag: call has 0 questions; send exactly one question per call$/]],
  ["probe with questions not an array", probe, undefined, [/^probe tag: call has 0 questions/]],
  ["node with zero questions (label check skipped)", node, [], [/^node tag: call has 0 questions/]],
  ["probe multi-select", probe, multiSelect(["A", "B"]), [/^probe tag: question is multi-select; use a single-select question$/]],
  ["goal multi-select", goal, multiSelect(["A", "B"]), [/^goal tag: question is multi-select/]],
  ["node multi-select", node, multiSelect(["A", "B"]), [/^node tag: question is multi-select/]],
  ["plan multi-select", plan, multiSelect(["Looks good", "No"]), [/^plan tag: question is multi-select/]],

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
