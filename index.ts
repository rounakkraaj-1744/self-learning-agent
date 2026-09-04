import dotenv from "dotenv";
dotenv.config()

import { runExperiment } from "./self-training-agent";

runExperiment().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
