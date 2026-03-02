import fs from "node:fs/promises";
import path from "node:path";

export const PLANNING_EVAL_LATEST_PATH = ".data/planning/eval/latest.json";

export type PlanningEvalDiff = {
  path?: string;
  kind?: string;
  expected?: unknown;
  actual?: unknown;
  tolerance?: number;
  diff?: number;
  added?: string[];
  removed?: string[];
};

export type PlanningEvalCase = {
  id?: string;
  title?: string;
  status?: string;
  diffs?: PlanningEvalDiff[];
};

export type PlanningEvalReport = {
  version?: number;
  generatedAt?: string;
  mode?: string;
  summary?: {
    total?: number;
    pass?: number;
    fail?: number;
  };
  cases?: PlanningEvalCase[];
};

function assertServerOnly(): void {
  if (typeof window !== "undefined") {
    throw new Error("planning regression reader is server-only.");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function resolveLatestEvalPath(): string {
  const override = (process.env.PLANNING_EVAL_REPORT_PATH ?? "").trim();
  return path.resolve(process.cwd(), override || PLANNING_EVAL_LATEST_PATH);
}

function toReport(raw: unknown): PlanningEvalReport | null {
  if (!isRecord(raw)) return null;

  const report: PlanningEvalReport = {};

  if (typeof raw.version === "number" && Number.isFinite(raw.version)) report.version = raw.version;
  if (typeof raw.generatedAt === "string") report.generatedAt = raw.generatedAt;
  if (typeof raw.mode === "string") report.mode = raw.mode;

  if (isRecord(raw.summary)) {
    report.summary = {};
    if (typeof raw.summary.total === "number" && Number.isFinite(raw.summary.total)) report.summary.total = raw.summary.total;
    if (typeof raw.summary.pass === "number" && Number.isFinite(raw.summary.pass)) report.summary.pass = raw.summary.pass;
    if (typeof raw.summary.fail === "number" && Number.isFinite(raw.summary.fail)) report.summary.fail = raw.summary.fail;
  }

  if (Array.isArray(raw.cases)) {
    report.cases = raw.cases
      .filter((row) => isRecord(row))
      .map((row) => ({
        ...(typeof row.id === "string" ? { id: row.id } : {}),
        ...(typeof row.title === "string" ? { title: row.title } : {}),
        ...(typeof row.status === "string" ? { status: row.status } : {}),
        ...(Array.isArray(row.diffs)
          ? {
            diffs: row.diffs
              .filter((diff) => isRecord(diff))
              .map((diff) => ({
                ...(typeof diff.path === "string" ? { path: diff.path } : {}),
                ...(typeof diff.kind === "string" ? { kind: diff.kind } : {}),
                ...(typeof diff.expected !== "undefined" ? { expected: diff.expected } : {}),
                ...(typeof diff.actual !== "undefined" ? { actual: diff.actual } : {}),
                ...(typeof diff.tolerance === "number" && Number.isFinite(diff.tolerance) ? { tolerance: diff.tolerance } : {}),
                ...(typeof diff.diff === "number" && Number.isFinite(diff.diff) ? { diff: diff.diff } : {}),
                ...(Array.isArray(diff.added) ? { added: diff.added.filter((item) => typeof item === "string") } : {}),
                ...(Array.isArray(diff.removed) ? { removed: diff.removed.filter((item) => typeof item === "string") } : {}),
              })),
          }
          : {}),
      }));
  }

  return report;
}

export async function readLatestEvalReport(): Promise<PlanningEvalReport | null> {
  assertServerOnly();
  const filePath = resolveLatestEvalPath();

  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    return toReport(parsed);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") return null;
    return null;
  }
}
