import { describe, expect, test } from "bun:test";
import { ACTIONS, evaluate, epsilonFor, makeProblem, retrieveExperiences, JsonExperienceStore, AdaptiveAgent } from "./self-training-agent";
import type { Experience } from "./types";

const experience = (action: string, reward: number, type: Experience["problemType"] = "NULL_UNDEFINED"): Experience => ({ id: crypto.randomUUID(), state: makeProblem(0).text, problemType: type, action, reasoning: "test", reward, success: reward >= .7, feedback: "", outcome: "", timestamp: Date.now() });

describe("learning components", () => {
  test("epsilon decays but respects minimum", () => { expect(epsilonFor(0)).toBe(1); expect(epsilonFor(100)).toBe(.1); });
  test("retrieval ranks relevant, rewarded experiences", () => { const result = retrieveExperiences([experience("Rewrite the function", .1, "PERFORMANCE"), experience("Write reproduction test", .95)], makeProblem(0)); expect(result[0]?.action).toBe("Write reproduction test"); });
  test("environment owns reward calculation", () => { expect(evaluate(makeProblem(0), "Write reproduction test").reward).toBe(.95); expect(evaluate(makeProblem(0), "Rewrite the function").reward).toBe(.1); });
  test("policy always returns an available action", async () => { const agent = new AdaptiveAgent(new JsonExperienceStore("/tmp/self-learning-agent-test.json")); await agent.init(); const result = await agent.decide(makeProblem(0), true); expect(ACTIONS.some(a => a.name === result.decision.action)).toBe(true); });
});
