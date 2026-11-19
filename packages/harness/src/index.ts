// The harness as a library: createHarness over a tools layer, or start() to build both from env.

export { createHarness, type Answer, type Harness, type HarnessDeps, type Question } from "./ask.ts";
export { loadHarnessConfig, type HarnessConfig } from "./config.ts";
export { loadRoster, loadRosterFromEnv, type Roster, type RosterHit } from "./roster.ts";
export { TASTE, tastePrompt } from "./taste.ts";
export { withPageReader } from "./page.ts";
export { start, type Running } from "./run.ts";
