import { readFileSync } from "node:fs";
import { readTopicLedger, setProposedPlan, slugify, writeTopicLedger } from "./mastery.mjs";
import { validatePlan } from "../hooks/teach/validate-teach-event.mjs";

// The teach skill runs this when it writes the plan message, so `/map` can draw the
// plan while the learner reads it. The approval question comes a turn later; approval
// itself is recorded by hooks/teach/mastery-record.mjs.
export function storeProposedPlan(topic, plan) {
  const slug = slugify(topic);
  writeTopicLedger(slug, setProposedPlan(readTopicLedger(slug), plan));
}

function fail(message) {
  console.error(`propose-plan.mjs: ${message}`);
  process.exit(1);
}

function main() {
  const topic = process.argv[2];
  if (!topic) fail("Usage: propose-plan.mjs <topic>  (the plan as JSON on stdin: {nodes, edges})");
  let plan;
  try {
    plan = JSON.parse(readFileSync(0, "utf8"));
  } catch (error) {
    fail(`stdin is not valid JSON: ${error.message}`);
  }
  const problems = [];
  validatePlan(plan, "plan", problems);
  if (problems.length > 0) fail(problems.join("; "));
  storeProposedPlan(topic, plan);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
