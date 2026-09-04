export const SIMPLE_AGENT_PROMPT = (problem: string, context: string) =>
  `Problem: ${problem}${context}\n\nProvide ONE specific action to solve this (be concise):`;

export const DECISION_PROMPT = (problem: string, actionNames: string[], history: string, candidateAction: string) =>
  `Choose exactly one action from the list and return only one valid JSON object with this shape: {"action":"<exact action>","reasoning":"<short reason, max 12 words>","confidence":0.0}. Do not include markdown or extra keys. Problem: ${problem}. Actions: ${actionNames.join(", ")}. Relevant outcomes: ${history || "none"}. Policy candidate: ${candidateAction}`;

export const LEARNING_SUMMARY_PROMPT = (experiences: string) =>
  `Analyze these recent agent experiences and identify 2-3 key patterns or lessons learned:\n${experiences}\n\nProvide concise insights that will help improve future decision-making.`;
