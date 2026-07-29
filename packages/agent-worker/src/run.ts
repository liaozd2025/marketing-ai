import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import {
  providerRoutesFromEnvironment,
  ProviderRouter,
} from "@marketing-ai/agent-service";
import { database } from "@marketing-ai/database";

import { AgentWorker } from "./worker";
import { ConfiguredSkillRuntime } from "./skill-runtime";

const queue = database.agentQueue;
const workerId = `agent-worker-${randomUUID()}`;
const worker = new AgentWorker(
  workerId,
  queue,
  new ProviderRouter(providerRoutesFromEnvironment(), queue),
  new ConfiguredSkillRuntime(database),
);
const runOnce = process.argv.includes("--once");
let stopping = false;

process.on("SIGINT", () => {
  stopping = true;
});
process.on("SIGTERM", () => {
  stopping = true;
});

try {
  await queue.recoverStaleTasks();
  do {
    const processed = await worker.runOnce();
    if (runOnce) {
      break;
    }
    if (!processed) {
      await delay(500);
    }
  } while (!stopping);
} finally {
  await database.close();
}
