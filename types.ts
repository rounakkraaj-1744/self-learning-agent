export const PROBLEM_TYPES = [
  "NULL_UNDEFINED",
  "TYPE_MISMATCH",
  "RACE_CONDITION",
  "PERFORMANCE",
  "API_CONTRACT",
  "REGRESSION",
  "STATE_MANAGEMENT",
] as const;

export type ProblemType = (typeof PROBLEM_TYPES)[number];

export interface Action {
  name: string;
  description: string;
}

export interface Problem {
  id: number;
  text: string;
  type: ProblemType;
  clues: string[];
}

export interface Decision {
  action: string;
  reasoning: string;
  confidence: number;
}

export interface Evaluation {
  reward: number;
  success: boolean;
  feedback: string;
  outcome: string;
}

export interface Experience {
  id: string;
  state: string;
  problemType: ProblemType;
  action: string;
  reasoning: string;
  reward: number;
  success: boolean;
  feedback: string;
  outcome: string;
  timestamp: number;
}

export interface AgentMemory {
  experiences: Experience[];
  performanceHistory: number[];
  successRate: number;
  averageReward: number;
}

export interface ActionOption {
  action: string;
  reasoning: string;
  confidence: number;
}
