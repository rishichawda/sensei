import { normalizeStrand } from "../../scripts/mastery.mjs";
import { isSlug, noteName } from "../vault/paths.mjs";

const KINDS = ["probe", "goal", "node", "plan", "wrap", "other"];
const ONE_QUESTION_KINDS = ["probe", "goal", "node", "plan", "wrap"];

const isText = (value) => typeof value === "string" && value.length > 0;

const MAX_ITEMS = 4;
const ITEM_KINDS = ["probe", "node"];

export function validateTeachEvent(event, questions) {
  const problems = [];
  const kind = event?.kind;

  if (event?.v !== 1) problems.push(`tag: v is ${JSON.stringify(event?.v)}; set it to 1`);
  if (!KINDS.includes(kind)) {
    problems.push(`tag: kind ${JSON.stringify(kind)} is not one of ${KINDS.join(", ")}`);
    return problems;
  }

  const at = `${kind} tag`;
  const qs = Array.isArray(questions) ? questions : [];
  const requireText = (field) => {
    if (!isText(event[field])) problems.push(`${at}: ${field} must be a non-empty string`);
  };

  if (event.items !== undefined && !ITEM_KINDS.includes(kind)) {
    problems.push(`${at}: items is only for probe and node tags; send one question per call`);
  }

  if (ITEM_KINDS.includes(kind) && event.items !== undefined) {
    requireText("topic");
    validateItems(event, qs, at, problems);
    return problems;
  }

  if (ONE_QUESTION_KINDS.includes(kind)) {
    if (qs.length !== 1) problems.push(`${at}: call has ${qs.length} questions; send exactly one question per call${ITEM_KINDS.includes(kind) ? ", or put several questions in the call with an items array" : ""}`);
    else if (qs[0]?.multiSelect === true) problems.push(`${at}: question is multi-select; use a single-select question`);
  }

  if (kind === "probe" || kind === "node") {
    requireText("topic");
    validateQuestionFields(kind, event, qs[0], qs.length > 0, at, problems);
  }

  if (kind === "goal") {
    requireText("topic");
    requireText("goal");
  }

  if (kind === "plan") {
    requireText("topic");
    requireLabelFor(event, "approve", qs[0], qs.length > 0, at, problems);
    validatePlan(event.plan, at, problems);
  }

  if (kind === "wrap") {
    requireText("topic");
    requireLabelFor(event, "done", qs[0], qs.length > 0, at, problems);
  }

  return problems;
}

const ROLE = { correct: "correct", approve: "approval", done: "I'm done" };

function requireLabelFor(ev, field, question, hasQuestions, at, problems) {
  if (!hasQuestions) return;
  const labels = Array.isArray(question?.options) ? question.options.map((o) => o?.label) : [];
  if (!(isText(ev[field]) && labels.includes(ev[field]))) {
    problems.push(`${at}: ${field} ${JSON.stringify(ev[field])} matches none of the option labels ${JSON.stringify(labels)}; set it to the exact label of the ${ROLE[field]} option`);
  }
}

// The per-question fields of a probe or node tag, for one question.
function validateQuestionFields(kind, ev, question, hasQuestions, at, problems) {
  if (kind === "node") {
    if (!isText(ev.node)) problems.push(`${at}: node must be a non-empty string`);
    if (ev.recordAs !== "graded") problems.push(`${at}: recordAs must be "graded"`);
    if (ev.card !== undefined && !(ev.card && isText(ev.card.q) && isText(ev.card.a))) {
      problems.push(`${at}: card must be an object with a non-empty string q (the question) and a (the answer)`);
    }
  }
  requireLabelFor(ev, "correct", question, hasQuestions, at, problems);
  if (kind === "probe" && ev.strand !== undefined && normalizeStrand(ev.strand) === undefined) {
    problems.push(`${at}: strand must be a non-empty string; name the prerequisite thread this question tests`);
  }
}

function validateItems(event, qs, at, problems) {
  const { items, kind } = event;
  if (!Array.isArray(items) || items.length === 0) {
    problems.push(`${at}: items must be a non-empty array with one object per question`);
    return;
  }
  if (items.length > MAX_ITEMS || qs.length > MAX_ITEMS) problems.push(`${at}: a call carries at most ${MAX_ITEMS} questions`);
  if (items.length !== qs.length) {
    problems.push(`${at}: items has ${items.length} items but the call has ${qs.length} questions; send one item per question, in the same order`);
  }
  qs.forEach((question, i) => {
    if (question?.multiSelect === true) problems.push(`${at}: question ${i + 1} is multi-select; use single-select questions`);
  });
  items.forEach((item, i) => {
    const where = `${at} items[${i}]`;
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      problems.push(`${where}: must be an object`);
      return;
    }
    validateQuestionFields(kind, item, qs[i], qs.length > 0, where, problems);
  });
}

export function validatePlan(plan, at, problems) {
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
    problems.push(`${at}: plan must be an object with nodes and edges`);
    return;
  }

  const nodesOk = Array.isArray(plan.nodes) && plan.nodes.length > 0 && plan.nodes.every(isText);
  if (!nodesOk) {
    problems.push(`${at}: plan.nodes must be a non-empty array of non-empty strings`);
  } else {
    const seen = new Set();
    for (const id of plan.nodes) {
      if (seen.has(id)) problems.push(`${at}: plan.nodes lists ${JSON.stringify(id)} more than once`);
      seen.add(id);
      if (!isSlug(id)) problems.push(`${at}: plan.nodes holds ${JSON.stringify(id)}; use a lowercase-hyphenated ID such as ${JSON.stringify(id.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "node-id")}`);
    }
  }

  if (nodesOk) {
    const labels = plan.labels && typeof plan.labels === "object" && !Array.isArray(plan.labels) ? plan.labels : null;
    const missing = plan.nodes.filter((id) => !isText(labels?.[id]));
    if (missing.length > 0) {
      problems.push(`${at}: plan.labels must give every node a plain-words name the learner will read; missing ${missing.map((id) => JSON.stringify(id)).join(", ")}`);
    } else {
      // Each label names a vault note, so it must make a usable, distinct file name.
      const taken = new Map();
      for (const id of new Set(plan.nodes)) {
        const name = noteName(plan.labels[id]);
        if (name === null) {
          problems.push(`${at}: plan.labels[${JSON.stringify(id)}] ${JSON.stringify(plan.labels[id])} cannot name a note; write a short phrase in words`);
        } else if (taken.has(name.toLowerCase())) {
          problems.push(`${at}: plan.labels gives ${JSON.stringify(taken.get(name.toLowerCase()))} and ${JSON.stringify(id)} the same name; word each step's label differently`);
        } else {
          taken.set(name.toLowerCase(), id);
        }
      }
    }
  }

  if (!Array.isArray(plan.edges)) {
    problems.push(`${at}: plan.edges must be an array of [from, to] pairs`);
    return;
  }
  plan.edges.forEach((edge, i) => {
    if (!Array.isArray(edge) || edge.length !== 2) {
      problems.push(`${at}: plan.edges[${i}] must be a [from, to] pair`);
      return;
    }
    if (!Array.isArray(plan.nodes)) return;
    for (const end of edge) {
      if (!plan.nodes.some((id) => isText(id) && id === end)) problems.push(`${at}: plan.edges[${i}] refers to ${JSON.stringify(end)}, which is not in plan.nodes`);
    }
  });
}
