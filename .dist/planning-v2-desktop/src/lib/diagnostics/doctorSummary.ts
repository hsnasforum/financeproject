import fs from "node:fs";
import path from "node:path";
import type { AllowedFixId } from "../dev/fixCatalog";

export type DoctorStatus = "OK" | "WARN" | "FAIL";

export type DoctorSummaryItem = {
  id: string;
  code: string;
  title: string;
  status: DoctorStatus;
  message: string;
  action: {
    label: string;
    command: string;
  };
  fixId?: AllowedFixId;
};

export type DoctorSummary = {
  overall: DoctorStatus;
  items: DoctorSummaryItem[];
};

type DoctorSummaryOptions = {
  baseDir?: string;
};

const DART_REQUIRED_FILES = [
  "disclosure_alerts.json",
  "disclosure_digest.json",
  "daily_brief.json",
] as const;

function resolveBaseDir(input?: string): string {
  if (typeof input === "string" && input.trim()) {
    return path.resolve(input);
  }
  return process.cwd();
}

function readText(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

function readJson(filePath: string): { exists: boolean; data?: unknown; error?: string } {
  if (!fs.existsSync(filePath)) return { exists: false };
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return { exists: true, data: JSON.parse(raw) as unknown };
  } catch (error) {
    return {
      exists: true,
      error: error instanceof Error ? error.message : "JSON_PARSE_FAILED",
    };
  }
}

function statusRank(status: DoctorStatus): number {
  if (status === "FAIL") return 2;
  if (status === "WARN") return 1;
  return 0;
}

function maxStatus(items: DoctorSummaryItem[]): DoctorStatus {
  let rank = 0;
  for (const item of items) {
    rank = Math.max(rank, statusRank(item.status));
  }
  if (rank === 2) return "FAIL";
  if (rank === 1) return "WARN";
  return "OK";
}

function parseSchemaBreakingCount(text: string): number | null {
  const regex = /\|\s*[^|]+\.json\s*\|\s*(\d+)\s*\|\s*\d+\s*\|/g;
  let found = false;
  let sum = 0;
  for (;;) {
    const match = regex.exec(text);
    if (!match) break;
    found = true;
    sum += Number(match[1] ?? 0);
  }
  if (found) return sum;
  if (text.includes("## Breaking Changes") && text.includes("- 없음")) return 0;
  return null;
}

function parseFreshnessSummary(text: string): {
  stale: number | null;
  missingTimestamp: number | null;
  invalidTimestamp: number | null;
} {
  const stale = Number(text.match(/- stale:\s*(\d+)/)?.[1] ?? NaN);
  const missingTimestamp = Number(text.match(/- missingTimestamp:\s*(\d+)/)?.[1] ?? NaN);
  const invalidTimestamp = Number(text.match(/- invalidTimestamp:\s*(\d+)/)?.[1] ?? NaN);
  return {
    stale: Number.isFinite(stale) ? stale : null,
    missingTimestamp: Number.isFinite(missingTimestamp) ? missingTimestamp : null,
    invalidTimestamp: Number.isFinite(invalidTimestamp) ? invalidTimestamp : null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function buildDailyRefreshItem(baseDir: string): DoctorSummaryItem {
  const filePath = path.join(baseDir, "tmp", "daily_refresh_result.json");
  const parsed = readJson(filePath);
  if (!parsed.exists) {
    return {
      id: "daily-refresh",
      code: "DAILY_REFRESH",
      title: "Daily Refresh",
      status: "WARN",
      message: "결과 파일이 없습니다. 아직 실행하지 않았을 수 있습니다.",
      action: { label: "재실행", command: "pnpm daily:refresh" },
      fixId: "DAILY_REFRESH",
    };
  }
  if (parsed.error) {
    return {
      id: "daily-refresh",
      code: "DAILY_REFRESH",
      title: "Daily Refresh",
      status: "FAIL",
      message: `JSON 파싱 실패: ${parsed.error}`,
      action: { label: "재실행", command: "pnpm daily:refresh" },
      fixId: "DAILY_REFRESH",
    };
  }
  if (!isRecord(parsed.data) || !Array.isArray(parsed.data.steps)) {
    return {
      id: "daily-refresh",
      code: "DAILY_REFRESH",
      title: "Daily Refresh",
      status: "FAIL",
      message: "steps 배열이 없어 상태를 판정할 수 없습니다.",
      action: { label: "재실행", command: "pnpm daily:refresh" },
      fixId: "DAILY_REFRESH",
    };
  }
  const steps = parsed.data.steps as Array<Record<string, unknown>>;
  const last = steps.at(-1);
  const hasFailed = steps.some((step) => String(step.status ?? "").trim() === "failed");
  if (hasFailed || String(parsed.data.ok ?? "").toLowerCase() === "false") {
    const lastName = String(last?.name ?? "unknown");
    return {
      id: "daily-refresh",
      code: "DAILY_REFRESH",
      title: "Daily Refresh",
      status: "FAIL",
      message: `실패 단계가 있습니다. 마지막 단계: ${lastName}`,
      action: { label: "재실행", command: "pnpm daily:refresh" },
      fixId: "DAILY_REFRESH",
    };
  }
  if (steps.length < 1) {
    return {
      id: "daily-refresh",
      code: "DAILY_REFRESH",
      title: "Daily Refresh",
      status: "WARN",
      message: "steps가 비어 있습니다.",
      action: { label: "재실행", command: "pnpm daily:refresh" },
      fixId: "DAILY_REFRESH",
    };
  }
  return {
    id: "daily-refresh",
    code: "DAILY_REFRESH",
    title: "Daily Refresh",
    status: "OK",
    message: `최근 실행 정상 (마지막 단계: ${String(last?.name ?? "-")})`,
    action: { label: "재실행", command: "pnpm daily:refresh" },
    fixId: "DAILY_REFRESH",
  };
}

function buildSchemaDriftItem(baseDir: string): DoctorSummaryItem {
  const filePath = path.join(baseDir, "docs", "schema-drift-report.md");
  const text = readText(filePath);
  if (text === null) {
    return {
      id: "schema-drift",
      code: "SCHEMA_DRIFT",
      title: "Schema Drift",
      status: "WARN",
      message: "schema drift 리포트가 없습니다.",
      action: { label: "생성", command: "pnpm schema:report" },
      fixId: "DATA_DOCTOR",
    };
  }
  const breaking = parseSchemaBreakingCount(text);
  if (breaking === null) {
    return {
      id: "schema-drift",
      code: "SCHEMA_DRIFT",
      title: "Schema Drift",
      status: "WARN",
      message: "리포트 파싱 실패(요약 형식을 확인하세요).",
      action: { label: "재생성", command: "pnpm schema:report" },
      fixId: "DATA_DOCTOR",
    };
  }
  if (breaking > 0) {
    return {
      id: "schema-drift",
      code: "SCHEMA_DRIFT",
      title: "Schema Drift",
      status: "FAIL",
      message: `breaking 변경 ${breaking}건`,
      action: { label: "점검", command: "pnpm schema:report" },
      fixId: "DATA_DOCTOR",
    };
  }
  return {
    id: "schema-drift",
    code: "SCHEMA_DRIFT",
    title: "Schema Drift",
    status: "OK",
    message: "breaking 변경 없음",
    action: { label: "재검사", command: "pnpm schema:report" },
    fixId: "DATA_DOCTOR",
  };
}

function buildFreshnessItem(baseDir: string): DoctorSummaryItem {
  const filePath = path.join(baseDir, "docs", "data-freshness-report.md");
  const text = readText(filePath);
  if (text === null) {
    return {
      id: "data-freshness",
      code: "DATA_FRESHNESS",
      title: "Data Freshness",
      status: "WARN",
      message: "freshness 리포트가 없습니다.",
      action: { label: "생성", command: "pnpm freshness:report" },
      fixId: "DATA_DOCTOR",
    };
  }

  const parsed = parseFreshnessSummary(text);
  if (parsed.stale === null || parsed.missingTimestamp === null || parsed.invalidTimestamp === null) {
    return {
      id: "data-freshness",
      code: "DATA_FRESHNESS",
      title: "Data Freshness",
      status: "WARN",
      message: "요약 파싱 실패(리포트 형식 확인 필요)",
      action: { label: "재생성", command: "pnpm freshness:report" },
      fixId: "DATA_DOCTOR",
    };
  }

  if (parsed.stale > 0 || parsed.invalidTimestamp > 0) {
    return {
      id: "data-freshness",
      code: "DATA_FRESHNESS",
      title: "Data Freshness",
      status: "FAIL",
      message: `stale=${parsed.stale}, invalid=${parsed.invalidTimestamp}`,
      action: { label: "복구 실행", command: "pnpm data:doctor" },
      fixId: "DATA_DOCTOR",
    };
  }
  if (parsed.missingTimestamp > 0) {
    return {
      id: "data-freshness",
      code: "DATA_FRESHNESS",
      title: "Data Freshness",
      status: "WARN",
      message: `missingTimestamp=${parsed.missingTimestamp}`,
      action: { label: "복구 실행", command: "pnpm data:doctor" },
      fixId: "DATA_DOCTOR",
    };
  }
  return {
    id: "data-freshness",
    code: "DATA_FRESHNESS",
    title: "Data Freshness",
    status: "OK",
    message: "strict 기준 내",
    action: { label: "재검사", command: "pnpm freshness:report" },
    fixId: "DATA_DOCTOR",
  };
}

function buildDartArtifactsItem(baseDir: string): DoctorSummaryItem {
  const dartDir = path.join(baseDir, "tmp", "dart");
  if (!fs.existsSync(dartDir)) {
    return {
      id: "dart-artifacts",
      code: "DART_ARTIFACTS",
      title: "DART Artifacts",
      status: "WARN",
      message: "tmp/dart 디렉터리가 없습니다.",
      action: { label: "생성", command: "pnpm dart:watch" },
      fixId: "DART_WATCH",
    };
  }

  const missing = DART_REQUIRED_FILES.filter((name) => !fs.existsSync(path.join(dartDir, name)));
  if (missing.length > 0) {
    return {
      id: "dart-artifacts",
      code: "DART_ARTIFACTS",
      title: "DART Artifacts",
      status: "WARN",
      message: `누락 파일: ${missing.join(", ")}`,
      action: { label: "생성", command: "pnpm dart:watch" },
      fixId: "DART_WATCH",
    };
  }

  return {
    id: "dart-artifacts",
    code: "DART_ARTIFACTS",
    title: "DART Artifacts",
    status: "OK",
    message: "핵심 아티팩트 존재",
    action: { label: "재생성", command: "pnpm dart:watch" },
    fixId: "DART_WATCH",
  };
}

function buildFeedbackStoreItem(baseDir: string): DoctorSummaryItem {
  const filePath = path.join(baseDir, "tmp", "user_feedback.json");
  const parsed = readJson(filePath);
  if (!parsed.exists) {
    return {
      id: "feedback-store",
      code: "FEEDBACK_STORE",
      title: "Feedback Store",
      status: "WARN",
      message: "파일이 없습니다. 아직 수집 전일 수 있습니다.",
      action: { label: "초기화", command: "printf '[]\\n' > tmp/user_feedback.json" },
    };
  }
  if (parsed.error) {
    return {
      id: "feedback-store",
      code: "FEEDBACK_STORE",
      title: "Feedback Store",
      status: "FAIL",
      message: `JSON 파싱 실패: ${parsed.error}`,
      action: { label: "초기화", command: "printf '[]\\n' > tmp/user_feedback.json" },
    };
  }

  if (Array.isArray(parsed.data)) {
    return {
      id: "feedback-store",
      code: "FEEDBACK_STORE",
      title: "Feedback Store",
      status: "OK",
      message: `배열 포맷(${parsed.data.length}개 항목)`,
      action: { label: "점검", command: "pnpm test tests/feedback-store.test.ts" },
    };
  }

  if (isRecord(parsed.data) && Array.isArray(parsed.data.items)) {
    return {
      id: "feedback-store",
      code: "FEEDBACK_STORE",
      title: "Feedback Store",
      status: "OK",
      message: `객체 포맷(${parsed.data.items.length}개 항목)`,
      action: { label: "점검", command: "pnpm test tests/feedback-store.test.ts" },
    };
  }

  return {
    id: "feedback-store",
    code: "FEEDBACK_STORE",
    title: "Feedback Store",
    status: "FAIL",
    message: "지원되지 않는 포맷입니다.",
    action: { label: "초기화", command: "printf '[]\\n' > tmp/user_feedback.json" },
  };
}

export function buildDoctorSummary(options: DoctorSummaryOptions = {}): DoctorSummary {
  const baseDir = resolveBaseDir(options.baseDir);
  const items: DoctorSummaryItem[] = [
    buildDailyRefreshItem(baseDir),
    buildSchemaDriftItem(baseDir),
    buildFreshnessItem(baseDir),
    buildDartArtifactsItem(baseDir),
    buildFeedbackStoreItem(baseDir),
  ];
  return {
    overall: maxStatus(items),
    items,
  };
}
