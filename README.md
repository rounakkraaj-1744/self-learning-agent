# Self-Learning Agent

A small TypeScript/Bun experiment demonstrating how an agent can improve its decision policy from previous experiences.

The agent receives a software-debugging problem, chooses a diagnostic action, receives a reward from the environment, and stores the result. On later runs, it uses that history to prefer actions that performed well while still exploring alternatives.

> This is an educational reinforcement-learning simulation. It is not an autonomous coding agent and does not modify source code.

## How it works

Each episode follows this loop:

```text
Problem → Choose action → Evaluate action → Store experience → Update policy
```

Two agents run side by side:

- **Baseline** always exploits its current best-known action.
- **Adaptive** uses epsilon-greedy exploration, trying alternatives before exploiting the best historical choice.

The adaptive agent's epsilon starts at `1.0` and decays toward `0.1`:

```text
epsilon = max(0.1, 1.0 × 0.96^experienceCount)
```

Early episodes explore heavily; later episodes rely more on learned results.

## Core concepts

### Problems and actions

The simulator cycles through missing values, type mismatches, race conditions, performance issues, API contract changes, regressions, and state-management bugs. Available actions include inspecting stack traces, adding logging, writing reproduction tests, checking types, profiling, inspecting diffs, and tracing state transitions.

### Rewards

`evaluate()` represents the environment and assigns a reward based on how appropriate an action is for the problem type:

- `0.95`: targeted action
- `0.70` or `0.80`: useful fallback
- `0.10`: broad rewrite with little diagnostic value

Rewards of at least `0.70` count as successful.

### Memory

Every decision is saved as an experience containing the problem, action, reasoning, reward, feedback, outcome, and timestamp. The adaptive agent ranks old experiences using problem similarity, reward, and recency. When Groq is enabled, relevant experiences are included in the model prompt.

## Requirements

- [Bun](https://bun.sh) 1.x
- Optional: a [Groq API key](https://console.groq.com/keys)

## Installation

```bash
git clone https://github.com/rounakkraaj-1744/self-learning-agent.git
cd self-learning-agent
bun install
```

## Configuration

```bash
cp .env.example .env
```

Optional `.env` values:

```env
GROQ_API_KEY=your_groq_api_key
GROQ_MODEL=llama-3.1-8b-instant
EPISODES=30
```

Without `GROQ_API_KEY`, the project runs with the local policy. With a key, Groq proposes a structured decision; failed or invalid model responses automatically fall back to the local policy.

Never commit `.env` or expose your API key.

## Running

```bash
bun index.ts
```

Run a specific number of episodes:

```bash
EPISODES=50 bun index.ts
```

The program prints selected episodes and final baseline/adaptive metrics: average reward, success rate, and experience count.

## Testing

```bash
bun test
bun run check
```

Tests cover epsilon decay, experience retrieval, reward calculation, and valid policy actions.

## Persistent data

Agent memories are stored in:

```text
data/baseline.json
data/adaptive.json
```

Delete them to reset the experiment:

```bash
rm data/baseline.json data/adaptive.json
```

These are generated runtime files; consider excluding them from Git if you want each clone to start fresh.

## Project structure

```text
├── index.ts                    # Entry point
├── self-training-agent.ts      # Agent, policy, memory, rewards, runner
├── constants.ts                # Model prompts
├── types.ts                    # TypeScript types
├── self-training-agent.test.ts # Bun tests
├── data/                       # Persisted experiences
└── .env.example                # Configuration template
```

## What “self-learning” means here

The agent is self-learning in the explicit sense that feedback from previous episodes changes future action selection, and that learned state persists in `data/adaptive.json`.

It does not train the language model, write new source code, or discover new actions. The reward function and action set are defined by the program, so this is best understood as a transparent learning-policy prototype.

## Limitations and next steps

- The environment is simulated and deterministic.
- Learning is primarily based on average reward per action.
- The policy is global rather than deeply problem-specific.
- Experiences use local JSON storage.

Possible extensions include real test/build feedback, per-problem action values, experiment tracking, metrics visualization, database-backed memory, and human feedback.