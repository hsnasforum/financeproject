import fs from "node:fs";
import path from "node:path";

export type DailyRefreshStepStatus = "ok" | "skipped" | "failed";

export type DailyRefreshStep = {
  name: string;
  status: DailyRefreshStepStatus;
  tookMs: number;
  stdoutTail: string;
  stderrTail: string;
};

export type DailyRefreshResult = {
  generatedAt: string | null;
  steps: DailyRefreshStep[];
  ok: boolean;
};

export type ReadDailyRefreshResultSuccess = {
  ok: true;
  data: DailyRefreshResult | null;
};

export type ReadDailyRefreshResultFailure = {
  ok: false;
  error: {
    code: "READ_FAILED" | "PARSE_FAILED";
    message: string;
  };
};

export type ReadDailyRefreshResultResponse = ReadDailyRefreshResultSuccess | ReadDailyRefreshResultFailure;

function asString(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function normalizeStatus(value: unknown): DailyRefreshStepStatus {
  const text = asString(value).toLowerCase();
  if (text === "failed") return "failed";
  if (text === "skipped") return "skipped";
  return "ok";
}

function normalizeResult(raw: unknown): DailyRefreshResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { generatedAt: null, steps: [], ok: false };
  }

  const row = raw as Record<string, unknown>;
  const stepsRaw = Array.isArray(row.steps) ? row.steps : [];
  const steps = stepsRaw
    .map((item): DailyRefreshStep | null => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const step = item as Record<string, unknown>;
      const name = asString(step.name);
      if (!name) return null;
      return {
        name,
        status: normalizeStatus(step.status),
        tookMs: Math.max(0, Math.round(asNumber(step.tookMs, 0))),
        stdoutTail: asString(step.stdoutTail),
        stderrTail: asString(step.stderrTail),
      };
    })
    .filter((item): item is DailyRefreshStep => item !== null);

  return {
    generatedAt: asString(row.generatedAt) || null,
    steps,
    ok: Boolean(row.ok),
  };
}

export function dailyRefreshResultPath(cwd = process.cwd()): string {
  return path.join(cwd, "tmp", "daily_refresh_result.json");
}

export function readDailyRefreshResult(filePath = dailyRefreshResultPath()): ReadDailyRefreshResultResponse {
  if (!fs.existsSync(filePath)) {
    return { ok: true, data: null };
  }

  let rawText = "";
  try {
    rawText = fs.readFileSync(filePath, "utf-8");
  } catch (error) {
    const message = error instanceof Error ? error.message : "daily refresh result read failed";
    return { ok: false, error: { code: "READ_FAILED", message } };
  }

  try {
    const parsed = JSON.parse(rawText) as unknown;
    return {
      ok: true,
      data: normalizeResult(parsed),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "daily refresh result parse failed";
    return { ok: false, error: { code: "PARSE_FAILED", message } };
  }
}
