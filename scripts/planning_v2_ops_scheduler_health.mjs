import { tsImport } from "tsx/esm/api";
import path from "node:path";
import { fileURLToPath } from "node:url";

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toInt(value, fallback) {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseArgs(argv = []) {
  const out = {
    limit: 40,
  };
  for (const token of argv) {
    if (!token.startsWith("--")) continue;
    const [rawKey, ...rest] = token.slice(2).split("=");
    const key = asString(rawKey);
    const value = asString(rest.join("="));
    if (key === "limit") out.limit = Math.max(1, Math.min(200, toInt(value, 40)));
  }
  return out;
}

async function runCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const modRaw = await tsImport("../src/lib/ops/scheduler/health.ts", { parentURL: import.meta.url });
  const mod = modRaw?.default && typeof modRaw.default === "object" ? modRaw.default : modRaw;
  if (typeof mod?.runSchedulerHealthGuard !== "function") {
    throw new Error("runSchedulerHealthGuard helper unavailable");
  }

  const result = await mod.runSchedulerHealthGuard({
    limit: args.limit,
  });
  const latestText = result.latestEvent
    ? `${result.latestEvent.mode}/${result.latestEvent.exitCode}/${result.latestEvent.ok ? "ok" : "fail"}`
    : "none";
  console.log("[planning:v2:ops:scheduler:health] summary");
  console.log(`- level=${result.summary.level}`);
  console.log(`- consecutiveFailures=${result.summary.consecutiveFailures}`);
  console.log(`- latest=${latestText}`);
  console.log(`- emitRiskAlert=${result.emitRiskAlert ? "true" : "false"}`);
  console.log(`- emitRecovered=${result.emitRecovered ? "true" : "false"}`);
  console.log(`- statePath=${result.statePath}`);
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runCli().catch((error) => {
    console.error("[planning:v2:ops:scheduler:health] failed", error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
