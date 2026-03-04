import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sanitizeV3LogMessage } from "../security/whitelist";

export type V3RefreshAllStepName = "indicators:refresh" | "news:refresh" | "v3:doctor";

export type V3RefreshAllStep = {
  name: V3RefreshAllStepName;
  command: string;
  args: string[];
};

export type V3RefreshAllStepResult = {
  name: V3RefreshAllStepName;
  command: string;
  exitCode: number;
  durationMs: number;
};

export type V3RefreshAllSummary = {
  startedAt: string;
  finishedAt: string;
  totalDurationMs: number;
  steps: V3RefreshAllStepResult[];
};

type ParsedArgs = {
  withDoctor: boolean;
};

type ExecStep = (input: { step: V3RefreshAllStep; cwd: string }) => {
  status: number | null;
  signal: NodeJS.Signals | null;
  error?: unknown;
};

type RunV3RefreshAllInput = {
  cwd?: string;
  withDoctor?: boolean;
  execStep?: ExecStep;
  now?: Date;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function parseArgs(argv: string[]): ParsedArgs {
  const withDoctor = argv.some((token) => asString(token) === "--with-doctor");
  return { withDoctor };
}

export function buildV3RefreshAllPlan(input: { withDoctor?: boolean } = {}): V3RefreshAllStep[] {
  const steps: V3RefreshAllStep[] = [
    { name: "indicators:refresh", command: "pnpm", args: ["indicators:refresh"] },
    { name: "news:refresh", command: "pnpm", args: ["news:refresh"] },
  ];

  if (input.withDoctor) {
    steps.push({ name: "v3:doctor", command: "pnpm", args: ["v3:doctor"] });
  }

  return steps;
}

function defaultExecStep(input: { step: V3RefreshAllStep; cwd: string }) {
  return spawnSync(input.step.command, input.step.args, {
    cwd: input.cwd,
    stdio: "inherit",
    env: process.env,
  });
}

function resolveExitCode(output: { status: number | null; signal: NodeJS.Signals | null; error?: unknown }): number {
  if (typeof output.status === "number") return output.status;
  if (output.signal) return 1;
  if (output.error) return 1;
  return 1;
}

export function runV3RefreshAll(input: RunV3RefreshAllInput = {}): V3RefreshAllSummary {
  const cwd = path.resolve(asString(input.cwd) || process.cwd());
  const now = input.now instanceof Date ? input.now : new Date();
  const startMs = now.getTime();
  const startedAt = now.toISOString();
  const execStep = input.execStep ?? defaultExecStep;
  const steps = buildV3RefreshAllPlan({ withDoctor: input.withDoctor });
  const results: V3RefreshAllStepResult[] = [];

  for (const step of steps) {
    const stepStarted = Date.now();
    const output = execStep({ step, cwd });
    const exitCode = resolveExitCode(output);
    const durationMs = Math.max(0, Date.now() - stepStarted);

    results.push({
      name: step.name,
      command: `${step.command} ${step.args.join(" ")}`,
      exitCode,
      durationMs,
    });

    if (exitCode !== 0) {
      throw new Error(`STEP_FAILED:${step.name}:${exitCode}`);
    }
  }

  const finishedAt = new Date().toISOString();
  const totalDurationMs = Math.max(0, Date.now() - startMs);

  return {
    startedAt,
    finishedAt,
    totalDurationMs,
    steps: results,
  };
}

function printSummary(summary: V3RefreshAllSummary): void {
  console.log(`[v3:refresh-all] startedAt=${summary.startedAt}`);
  for (const row of summary.steps) {
    console.log(`[v3:refresh-all] ${row.name} exit=${row.exitCode} durationMs=${row.durationMs}`);
  }
  console.log(`[v3:refresh-all] finishedAt=${summary.finishedAt} totalDurationMs=${summary.totalDurationMs}`);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const summary = runV3RefreshAll({ withDoctor: args.withDoctor });
  printSummary(summary);
}

const isMain = (() => {
  if (!process.argv[1]) return false;
  const current = fileURLToPath(import.meta.url);
  return path.resolve(process.argv[1]) === current;
})();

if (isMain) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[v3:refresh-all] failed: ${sanitizeV3LogMessage(message)}`);
    process.exitCode = 1;
  }
}
