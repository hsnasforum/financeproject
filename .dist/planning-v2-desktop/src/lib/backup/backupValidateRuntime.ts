import fs from "node:fs";
import path from "node:path";

export type RuntimeValidationResult = {
  ok: boolean;
  issues: string[];
};

type RuntimeValidationOptions = {
  baseDir?: string;
  requiredPaths?: string[];
};

type JsonReadResult =
  | { exists: false }
  | { exists: true; value: unknown }
  | { exists: true; parseError: string };

const REQUIRED_GENERATED_AT_PATHS = [
  "tmp/dart/disclosure_alerts.json",
  "tmp/dart/disclosure_digest.json",
  "tmp/dart/daily_brief.json",
] as const;

function normalizePath(value: string): string {
  return String(value ?? "").trim().replaceAll("\\", "/");
}

function readJsonFile(baseDir: string, relativePath: string): JsonReadResult {
  const absolutePath = path.join(baseDir, relativePath);
  if (!fs.existsSync(absolutePath)) return { exists: false };
  try {
    const raw = fs.readFileSync(absolutePath, "utf-8");
    return { exists: true, value: JSON.parse(raw) as unknown };
  } catch (error) {
    return {
      exists: true,
      parseError: error instanceof Error ? error.message : "JSON_PARSE_FAILED",
    };
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function addMissingIssue(
  issues: string[],
  requiredPaths: Set<string>,
  relativePath: string,
): void {
  const normalized = normalizePath(relativePath);
  if (!requiredPaths.has(normalized)) return;
  issues.push(`${normalized}: 복원 대상 파일이 존재하지 않습니다.`);
}

function validateGeneratedAtFile(
  issues: string[],
  baseDir: string,
  requiredPaths: Set<string>,
  relativePath: string,
): void {
  const result = readJsonFile(baseDir, relativePath);
  if (!result.exists) {
    addMissingIssue(issues, requiredPaths, relativePath);
    return;
  }
  if ("parseError" in result) {
    issues.push(`${relativePath}: JSON 파싱 실패 (${result.parseError})`);
    return;
  }
  if (!isObject(result.value) || typeof result.value.generatedAt !== "string" || !result.value.generatedAt.trim()) {
    issues.push(`${relativePath}: generatedAt 필드가 필요합니다.`);
  }
}

export function validateRuntime(options: RuntimeValidationOptions = {}): RuntimeValidationResult {
  const baseDir = path.resolve(options.baseDir ?? process.cwd());
  const requiredPaths = new Set(
    (options.requiredPaths ?? [])
      .map((entry) => normalizePath(entry))
      .filter((entry) => entry.length > 0),
  );
  const issues: string[] = [];

  const userFeedbackPath = "tmp/user_feedback.json";
  const userFeedback = readJsonFile(baseDir, userFeedbackPath);
  if (!userFeedback.exists) {
    addMissingIssue(issues, requiredPaths, userFeedbackPath);
  } else if ("parseError" in userFeedback) {
    issues.push(`${userFeedbackPath}: JSON 파싱 실패 (${userFeedback.parseError})`);
  } else if (Array.isArray(userFeedback.value)) {
    // Legacy support: existing installs may still store array-only payloads.
  } else if (!isObject(userFeedback.value)) {
    issues.push(`${userFeedbackPath}: 객체 형태여야 합니다.`);
  } else {
    if (!Object.prototype.hasOwnProperty.call(userFeedback.value, "version")) {
      issues.push(`${userFeedbackPath}: version 필드가 필요합니다.`);
    }
    if (!Array.isArray(userFeedback.value.items)) {
      issues.push(`${userFeedbackPath}: items 배열이 필요합니다.`);
    }
  }

  for (const relativePath of REQUIRED_GENERATED_AT_PATHS) {
    validateGeneratedAtFile(issues, baseDir, requiredPaths, relativePath);
  }

  const refreshPath = "tmp/daily_refresh_result.json";
  const refresh = readJsonFile(baseDir, refreshPath);
  if (!refresh.exists) {
    addMissingIssue(issues, requiredPaths, refreshPath);
  } else if ("parseError" in refresh) {
    issues.push(`${refreshPath}: JSON 파싱 실패 (${refresh.parseError})`);
  } else if (!isObject(refresh.value) || !Array.isArray(refresh.value.steps)) {
    issues.push(`${refreshPath}: steps 배열이 필요합니다.`);
  }

  return {
    ok: issues.length < 1,
    issues,
  };
}
