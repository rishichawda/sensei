const KINDS = ["probe", "goal", "node", "plan", "wrap", "other"];
const ONE_QUESTION_KINDS = ["probe", "goal", "node", "plan", "wrap"];

const isText = (value) => typeof value === "string" && value.length > 0;

export function validateTeachEvent(event, questions) {
  const problems = [];
  const kind = event?.kind;

  if (event?.v !== 1) problems.push(`tag: v is ${JSON.stringify(event?.v)}; set it to 1`);
  if (!KINDS.includes(kind)) {
    problems.push(`tag: kind ${JSON.stringify(kind)} is not one of ${KINDS.join(", ")}`);
    return problems;
  }

  const at = `${kind} tag`;
  const requireText = (field) => {
    if (!isText(event[field])) problems.push(`${at}: ${field} must be a non-empty string`);
  };
  const qs = Array.isArray(questions) ? questions : [];
  const labels = Array.isArray(qs[0]?.options) ? qs[0].options.map((o) => o?.label) : [];
  const ROLE = { correct: "correct", approve: "approval", done: "I'm done" };
  const requireLabel = (field) => {
    if (qs.length > 0 && !(isText(event[field]) && labels.includes(event[field]))) {
      problems.push(`${at}: ${field} ${JSON.stringify(event[field])} matches none of the option labels ${JSON.stringify(labels)}; set it to the exact label of the ${ROLE[field]} option`);
    }
  };

  if (ONE_QUESTION_KINDS.includes(kind)) {
    if (qs.length !== 1) problems.push(`${at}: call has ${qs.length} questions; send exactly one question per call`);
    else if (qs[0]?.multiSelect === true) problems.push(`${at}: question is multi-select; use a single-select question`);
  }

  if (kind === "probe") {
    requireText("topic");
    requireLabel("correct");
    if (event.strand !== undefined && !(typeof event.strand === "string" && event.strand.trim().length > 0)) {
      problems.push(`${at}: strand must be a non-empty string; name the prerequisite thread this question tests, or leave strand out`);
    }
  }

  if (kind === "goal") {
    requireText("topic");
    requireText("goal");
  }

  if (kind === "node") {
    requireText("topic");
    requireText("node");
    if (event.recordAs !== "graded") problems.push(`${at}: recordAs must be "graded"`);
    requireLabel("correct");
  }

  if (kind === "plan") {
    requireText("topic");
    requireLabel("approve");
    validatePlan(event.plan, at, problems);
  }

  if (kind === "wrap") {
    requireText("topic");
    requireLabel("done");
  }

  return problems;
}

function validatePlan(plan, at, problems) {
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
