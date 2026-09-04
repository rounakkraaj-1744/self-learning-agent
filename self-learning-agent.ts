import dotenv from "dotenv";
dotenv.config()
import Groq from "groq-sdk";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { Action, Decision, Evaluation, Experience, Problem, ProblemType, AgentMemory} from "./types";
import { DECISION_PROMPT } from "./constants";

export const ACTIONS: Action[] = [
  { name: "Inspect stack trace", description: "identify the failing path" },
  { name: "Add targeted logging", description: "observe inputs and state" },
  { name: "Write reproduction test", description: "reproduce the failure" },
  { name: "Inspect type definitions", description: "check types and contracts"},
  { name: "Profile the code", description: "measure performance hotspots" },
  { name: "Rewrite the function", description: "replace implementation broadly"},
  { name: "Inspect recent diff", description: "find regressions" },
  { name: "Inspect state transitions", description: "trace ordering and updates"},
];

const TYPES: ProblemType[] = [
  "NULL_UNDEFINED",
  "TYPE_MISMATCH",
  "RACE_CONDITION",
  "PERFORMANCE",
  "API_CONTRACT",
  "REGRESSION",
  "STATE_MANAGEMENT",
];

const texts: Record<ProblemType, string> = {
  NULL_UNDEFINED: "An API endpoint returns 500 when optional user data is missing.",
  TYPE_MISMATCH: "A parsed JSON field reaches a function with the wrong runtime type.",
  RACE_CONDITION: "An intermittent failure appears when two requests update shared data.",
  PERFORMANCE: "A request becomes slow as the number of records grows.",
  API_CONTRACT: "A consumer breaks because the upstream response shape changed.",
  REGRESSION: "A previously passing test fails after a recent refactor.",
  STATE_MANAGEMENT: "The UI shows stale data after an asynchronous update.",
};

export function makeProblem(id: number): Problem {
  const problemType = TYPES[id % TYPES.length]!;
  return { id, type: problemType, text: texts[problemType], clues: [problemType.toLowerCase()] };
}

export function evaluate(p: Problem, action: string): Evaluation {
  const best: Record<ProblemType, string> = {
    NULL_UNDEFINED: "Write reproduction test",
    TYPE_MISMATCH: "Inspect type definitions",
    RACE_CONDITION: "Inspect state transitions",
    PERFORMANCE: "Profile the code",
    API_CONTRACT: "Inspect type definitions",
    REGRESSION: "Inspect recent diff",
    STATE_MANAGEMENT: "Inspect state transitions",
  };
  
  const fallbackReward = action === "Write reproduction test" ? 0.8 : 0.7;
  const reward = action === best[p.type] ? 0.95 : action === "Rewrite the function" ? 0.1 : fallbackReward;
  
  return {
    reward,
    success: reward >= 0.7,
    feedback: reward >= 0.9 ? "Highly targeted for this defect class." : reward >= 0.7 ? "Useful evidence, though not optimal." : "Poorly targeted; little actionable evidence.",
    outcome: reward >= 0.7 ? "The diagnostic path exposed useful evidence." : "The approach did not isolate the defect.",
  };
}
export function epsilonFor(n: number, initial = 1, minimum = 0.1, decay = 0.96) {
  return Math.max(minimum, initial * Math.pow(decay, n));
}

type Stat = { attempts: number; totalReward: number; averageReward: number };

export class JsonExperienceStore {
  constructor(private file = "data/experiences.json") {}
  async load(): Promise<Experience[]> {
    try {
      return JSON.parse(await readFile(this.file, "utf8")) as Experience[];
    } catch {
      return [];
    }
  }
  
  async save(experience: Experience) {
    const experiences = await this.load();
    experiences.push(experience);
    await mkdir("data", { recursive: true });
    await writeFile(this.file, JSON.stringify(experiences, null, 2));
  }
}
const tokenize = (text: string) => new Set(text.toLowerCase().split(/[^a-z0-9_]+/).filter((token) => token.length > 2));

export function retrieveExperiences(all: Experience[], p: Problem, limit = 6) {
  const targetTokens = tokenize(`${p.type} ${p.text}`);
  const score = (experience: Experience) =>
    ([...targetTokens].filter((token) => tokenize(experience.state).has(token)).length /
      Math.max(targetTokens.size, 1)) * 0.5 + experience.reward * 0.3 + Math.exp(-(Date.now() - experience.timestamp) / 2.592e9) * 0.2;
  return [...all].sort((first, second) => score(second) - score(first)).slice(0, limit);
}

export class AdaptiveAgent {
  private experiences: Experience[] = [];
  
  private stats: AgentMemory = {
    experiences: [],
    performanceHistory: [],
    successRate: 0,
    averageReward: 0,
  };

  constructor(private store: JsonExperienceStore, private groq = new Groq({ apiKey: process.env.GROQ_API_KEY })) { }

  async init() {
    this.experiences = await this.store.load();
    this.stats.experiences = this.experiences;
    for (const e of this.experiences)
      this.update(e);
  }
  
  private update(e: Experience) {
    this.stats.performanceHistory.push(e.reward);
    this.stats.averageReward = this.stats.performanceHistory.reduce((a, b) => a + b, 0) / this.stats.performanceHistory.length;
    this.stats.successRate =
      this.experiences.filter((x) => x.success).length /
      this.experiences.length;
  }
  
  private best(actions: Action[]) {
    const totals = new Map<string, number[]>();
    for (const e of this.experiences) {
      if (!totals.has(e.action))
        totals.set(e.action, []);
      totals.get(e.action)!.push(e.reward);
    }
    
    return actions.reduce((a, b) =>
      avg(totals.get(b.name)) > avg(totals.get(a.name)) ? b : a,
    );
  }
  
  async decide(p: Problem, adaptive: boolean): Promise<{ decision: Decision; exploration: boolean }> {
    const best = this.best(ACTIONS);
    const epsilon = adaptive ? epsilonFor(this.experiences.length) : 0;
    const exploration = Math.random() < epsilon;
    const candidate = exploration ? ACTIONS.filter((a) => a.name !== best.name)[Math.floor(Math.random() * (ACTIONS.length - 1))]!: best;
    if (!process.env.GROQ_API_KEY)
      return {
        exploration,
        decision: {
          action: candidate.name,
          reasoning: exploration ? "Trying an under-tested strategy." : "Using the strongest contextual historical result.",
          confidence: 0.7,
        },
      };
    
    const prior = retrieveExperiences(this.experiences, p).map((e) => `${e.problemType}: ${e.action}=${e.reward}`).join("; ");

    let decisionPayload: Partial<Decision> = {};
    try {
      const response = await this.groq.chat.completions.create({
        model: process.env.GROQ_MODEL ?? "llama-3.1-8b-instant",
        temperature: 0.2,
        // Reasoning models can use completion tokens before emitting JSON.
        max_tokens: 512,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: DECISION_PROMPT(p.text, ACTIONS.map((action) => action.name), prior, candidate.name),
          },
        ],
      });
      decisionPayload = JSON.parse(response.choices[0]?.message.content ?? "{}");
    } catch {
      // A provider error (including truncated structured output) should not
      // stop the experiment; use the locally computed policy candidate.
    }

    if (!ACTIONS.some((action) => action.name === decisionPayload.action) || typeof decisionPayload.reasoning !== "string" || typeof decisionPayload.confidence !== "number")
      return {
        exploration,
        decision: {
          action: candidate.name,
          reasoning: "Invalid model output; policy fallback.",
          confidence: 0,
        },
      };
    return { exploration, decision: decisionPayload as Decision };
  }
  
  async record(p: Problem, d: Decision, result: Evaluation) {
    const e: Experience = {
      id: `${Date.now()}-${p.id}`,
      state: p.text,
      problemType: p.type,
      action: d.action,
      reasoning: d.reasoning,
      ...result,
      timestamp: Date.now(),
    };
    this.experiences.push(e);
    this.stats.experiences = this.experiences;
    this.update(e);
    await this.store.save(e);
  }
  
  getStats() {
    return this.stats;
  }
}

function avg(values?: number[]) {
  return values?.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

export async function runExperiment(n = Number(process.env.EPISODES ?? 30)) {
  const b = new AdaptiveAgent(new JsonExperienceStore("data/baseline.json"));
  const a = new AdaptiveAgent(new JsonExperienceStore("data/adaptive.json"));
  await b.init();
  await a.init();
  for (let i = 0; i < n; i++)
    for (const [name, agent, adaptive] of [
      ["BASELINE", b, false],
      ["ADAPTIVE", a, true],
    ] as const) {
      const p = makeProblem(i),
        x = await agent.decide(p, adaptive);
      const result = evaluate(p, x.decision.action);
      await agent.record(p, x.decision, result);
      if (name === "ADAPTIVE" && (i < 3 || i === n - 1))
        console.log(
          `\nEPISODE ${i + 1}\nProblem: ${p.text}\nMode: ${x.exploration ? "EXPLORE" : "EXPLOIT"}\nDecision: ${x.decision.action}\nResult: ${result.success ? "SUCCESS" : "WEAK"} (${result.reward})\nFeedback: ${result.feedback}`,
        );
    }
  console.log(
    `\nEXPERIMENT COMPLETE\n\nBASELINE\n${report(b)}\n\nADAPTIVE AGENT\n${report(a)}`,
  );
}

function report(a: AdaptiveAgent) {
  const s = a.getStats();
  return `Average Reward: ${s.averageReward.toFixed(2)}\nSuccess Rate: ${(s.successRate * 100).toFixed(1)}%\nExperiences: ${s.experiences.length}`;
}

if (import.meta.main)
  runExperiment().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  });
