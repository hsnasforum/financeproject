import fs from "node:fs/promises";
import path from "node:path";
import { type DoctorCheck } from "./doctorChecks";
import { loadOpsPolicy } from "./opsPolicy";
import { loadFinlifeSnapshot, type FinlifeSnapshot, type FinlifeSnapshotKind } from "../finlife/snapshot";
import { loadCorpIndex, type CorpCodeIndexV1 } from "../publicApis/dart/corpIndex";
import { redactText } from "../planning/privacy/redact";
import { atomicWriteJson } from "../planning/storage/atomicWrite";

export type DataQualityStatus = "PASS" | "WARN" | "FAIL";

export type DataQualityIssueCode =
  | "DATASET_MISSING"
  | "MISSING_REQUIRED"
  | "DUPLICATE_KEY"
  | "RATE_ANOMALY"
  | "STALE_TIMESTAMP";

export type FinlifeNormalizedRow = {
  providerName: string;
  productName: string;
  termMonths: number | null;
  baseRatePct: number | null;
  bonusRatePct: number | null;
};

export type DartCorpNormalizedRow = {
  corpCode: string;
  corpName: string;
  stockCode?: string;
};

export type DataQualityIssue = {
  code: DataQualityIssueCode;
  count: number;
  message: string;
  samples: Array<Record<string, unknown>>;
};

export type DatasetQualityReport = {
  datasetId: "finlife:deposit" | "finlife:saving" | "dart:corp-index";
  label: string;
  checkedAt: string;
  status: DataQualityStatus;
  staleDays?: number;
  generatedAt?: string;
  totals: {
    rows: number;
    missingRequired: number;
    duplicates: number;
    rateAnomalies: number;
  };
  issues: DataQualityIssue[];
};

export type ExternalDataQualityReport = {
  checkedAt: string;
  overallStatus: DataQualityStatus;
  summary: {
    pass: number;
    warn: number;
    fail: number;
  };
  datasets: DatasetQualityReport[];
};

type EvaluateOptions = {
  now?: Date;
  staleWarnDays: number;
  sampleLimit?: number;
};

const DATA_QUALITY_REPORT_PATH = path.resolve(process.cwd(), ".data/ops/data-quality/latest.json");

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toDateIso(value: unknown): string | undefined {
  const raw = asString(value);
  if (!raw) return undefined;
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return undefined;
  return new Date(parsed).toISOString();
}

function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return Number.NaN;
  return parsed;
}

function toTermMonths(value: unknown): number | null {
  const raw = asString(value);
  if (!raw) return null;
  const digits = raw.match(/\d+/g)?.join("") ?? "";
  const parsed = Number(digits);
  if (!Number.isFinite(parsed) || parsed < 1) return null;
  return Math.trunc(parsed);
}

function pushSample(target: Array<Record<string, unknown>>, sample: Record<string, unknown>, limit: number): void {
  if (target.length >= limit) return;
  target.push(sanitizeSample(sample));
}

function sanitizeSample(sample: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(sample)) {
    if (typeof value === "string") {
      out[key] = redactText(value).slice(0, 120);
    } else if (typeof value === "number" || typeof value === "boolean" || value === null) {
      out[key] = value;
    }
  }
  return out;
}

function makeIssue(code: DataQualityIssueCode, count: number, message: string, samples: Array<Record<string, unknown>>): DataQualityIssue | null {
  if (count < 1) return null;
  return {
    code,
    count,
    message,
    samples,
  };
}

function computeStaleDays(generatedAtIso: string | undefined, now: Date): number | undefined {
  if (!generatedAtIso) return undefined;
  const generatedMs = Date.parse(generatedAtIso);
  if (!Number.isFinite(generatedMs)) return undefined;
  const nowUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const generated = new Date(generatedMs);
  const generatedUtc = Date.UTC(generated.getUTCFullYear(), generated.getUTCMonth(), generated.getUTCDate());
  return Math.max(0, Math.floor((nowUtc - generatedUtc) / 86_400_000));
}

function computeStatus(input: {
  datasetMissing: boolean;
  missingRequired: number;
  duplicates: number;
  rateAnomalies: number;
  staleDays?: number;
  staleWarnDays: number;
}): DataQualityStatus {
  if (input.datasetMissing) return "WARN";
  if (input.missingRequired > 0) return "FAIL";
  if (input.duplicates > 0 || input.rateAnomalies > 0) return "WARN";
  if (typeof input.staleDays === "number" && input.staleDays > input.staleWarnDays) return "WARN";
  return "PASS";
}

function normalizeFinlifeRows(snapshot: FinlifeSnapshot | null): FinlifeNormalizedRow[] {
  if (!snapshot) return [];
  const rows: FinlifeNormalizedRow[] = [];
  for (const product of snapshot.items) {
    const providerName = asString(product.kor_co_nm);
    const productName = asString(product.fin_prdt_nm);
    if (!Array.isArray(product.options) || product.options.length < 1) {
      rows.push({
        providerName,
        productName,
        termMonths: null,
        baseRatePct: null,
        bonusRatePct: null,
      });
      continue;
    }

    for (const option of product.options) {
      rows.push({
        providerName,
        productName,
        termMonths: toTermMonths(option.save_trm),
        baseRatePct: toFiniteNumber(option.intr_rate),
        bonusRatePct: toFiniteNumber(option.intr_rate2),
      });
    }
  }
  return rows;
}

function normalizeDartCorpRows(index: CorpCodeIndexV1 | null): DartCorpNormalizedRow[] {
  if (!index) return [];
  return index.items.map((item) => ({
    corpCode: asString(item.corpCode),
    corpName: asString(item.corpName),
    ...(asString(item.stockCode) ? { stockCode: asString(item.stockCode) } : {}),
  }));
}

export function evaluateFinlifeSnapshotQuality(
  datasetId: "finlife:deposit" | "finlife:saving",
  snapshot: FinlifeSnapshot | null,
  options: EvaluateOptions,
): DatasetQualityReport {
  const now = options.now ?? new Date();
  const sampleLimit = Math.max(1, options.sampleLimit ?? 5);
  const rows = normalizeFinlifeRows(snapshot);
  const generatedAt = toDateIso(snapshot?.meta?.generatedAt);
  const staleDays = computeStaleDays(generatedAt, now);

  let missingRequired = 0;
  let duplicates = 0;
  let rateAnomalies = 0;

  const missingSamples: Array<Record<string, unknown>> = [];
  const duplicateSamples: Array<Record<string, unknown>> = [];
  const rateSamples: Array<Record<string, unknown>> = [];
  const seen = new Map<string, number>();

  for (const row of rows) {
    if (!row.providerName || !row.productName || row.termMonths === null) {
      missingRequired += 1;
      pushSample(missingSamples, row, sampleLimit);
    }

    if (row.providerName && row.productName && row.termMonths !== null) {
      const key = `${row.providerName}|${row.productName}|${row.termMonths}`;
      const count = (seen.get(key) ?? 0) + 1;
      seen.set(key, count);
      if (count > 1) {
        duplicates += 1;
        pushSample(duplicateSamples, {
          providerName: row.providerName,
          productName: row.productName,
          termMonths: row.termMonths,
        }, sampleLimit);
      }
    }

    const rates: Array<{ key: "baseRatePct" | "bonusRatePct"; value: number | null }> = [
      { key: "baseRatePct", value: row.baseRatePct },
      { key: "bonusRatePct", value: row.bonusRatePct },
    ];
    for (const rate of rates) {
      if (rate.value === null) continue;
      if (!Number.isFinite(rate.value) || rate.value < 0 || rate.value > 100) {
        rateAnomalies += 1;
        pushSample(rateSamples, {
          providerName: row.providerName,
          productName: row.productName,
          termMonths: row.termMonths,
          [rate.key]: String(rate.value),
        }, sampleLimit);
      }
    }
  }

  const staleIssueSamples: Array<Record<string, unknown>> = [];
  if (typeof staleDays === "number" && staleDays > options.staleWarnDays) {
    pushSample(staleIssueSamples, {
      generatedAt: generatedAt ?? "",
      staleDays,
      staleWarnDays: options.staleWarnDays,
    }, sampleLimit);
  }

  const datasetMissing = snapshot === null;
  const missingDatasetSamples: Array<Record<string, unknown>> = [];
  if (datasetMissing) {
    pushSample(missingDatasetSamples, { datasetId }, sampleLimit);
  }

  const issues = [
    makeIssue("DATASET_MISSING", datasetMissing ? 1 : 0, "snapshot 파일이 없어 품질 검사를 수행할 수 없습니다.", missingDatasetSamples),
    makeIssue("MISSING_REQUIRED", missingRequired, "필수 필드(provider/product/term) 누락이 있습니다.", missingSamples),
    makeIssue("DUPLICATE_KEY", duplicates, "동일 provider+product+term 중복이 있습니다.", duplicateSamples),
    makeIssue("RATE_ANOMALY", rateAnomalies, "금리 값이 음수/100초과/비정상입니다.", rateSamples),
    makeIssue(
      "STALE_TIMESTAMP",
      typeof staleDays === "number" && staleDays > options.staleWarnDays ? 1 : 0,
      `데이터 생성 시각이 ${options.staleWarnDays}일 기준보다 오래되었습니다.`,
      staleIssueSamples,
    ),
  ].filter((issue): issue is DataQualityIssue => issue !== null);

  const status = computeStatus({
    datasetMissing,
    missingRequired,
    duplicates,
    rateAnomalies,
    staleDays,
    staleWarnDays: options.staleWarnDays,
  });

  return {
    datasetId,
    label: datasetId === "finlife:deposit" ? "Finlife Deposit" : "Finlife Saving",
    checkedAt: now.toISOString(),
    status,
    ...(typeof staleDays === "number" ? { staleDays } : {}),
    ...(generatedAt ? { generatedAt } : {}),
    totals: {
      rows: rows.length,
      missingRequired,
      duplicates,
      rateAnomalies,
    },
    issues,
  };
}

export function evaluateDartCorpIndexQuality(
  index: CorpCodeIndexV1 | null,
  options: EvaluateOptions,
): DatasetQualityReport {
  const now = options.now ?? new Date();
  const sampleLimit = Math.max(1, options.sampleLimit ?? 5);
  const rows = normalizeDartCorpRows(index);
  const generatedAt = toDateIso(index?.generatedAt);
  const staleDays = computeStaleDays(generatedAt, now);

  let missingRequired = 0;
  let duplicates = 0;

  const missingSamples: Array<Record<string, unknown>> = [];
  const duplicateSamples: Array<Record<string, unknown>> = [];
  const seen = new Map<string, number>();

  for (const row of rows) {
    if (!row.corpCode || !row.corpName) {
      missingRequired += 1;
      pushSample(missingSamples, row, sampleLimit);
    }

    if (row.corpCode) {
      const count = (seen.get(row.corpCode) ?? 0) + 1;
      seen.set(row.corpCode, count);
      if (count > 1) {
        duplicates += 1;
        pushSample(duplicateSamples, {
          corpCode: row.corpCode,
          corpName: row.corpName,
        }, sampleLimit);
      }
    }
  }

  const staleIssueSamples: Array<Record<string, unknown>> = [];
  if (typeof staleDays === "number" && staleDays > options.staleWarnDays) {
    pushSample(staleIssueSamples, {
      generatedAt: generatedAt ?? "",
      staleDays,
      staleWarnDays: options.staleWarnDays,
    }, sampleLimit);
  }

  const datasetMissing = index === null;
  const missingDatasetSamples: Array<Record<string, unknown>> = [];
  if (datasetMissing) {
    pushSample(missingDatasetSamples, { datasetId: "dart:corp-index" }, sampleLimit);
  }

  const issues = [
    makeIssue("DATASET_MISSING", datasetMissing ? 1 : 0, "corp index 파일이 없어 품질 검사를 수행할 수 없습니다.", missingDatasetSamples),
    makeIssue("MISSING_REQUIRED", missingRequired, "필수 필드(corpCode/corpName) 누락이 있습니다.", missingSamples),
    makeIssue("DUPLICATE_KEY", duplicates, "동일 corpCode 중복이 있습니다.", duplicateSamples),
    makeIssue(
      "STALE_TIMESTAMP",
      typeof staleDays === "number" && staleDays > options.staleWarnDays ? 1 : 0,
      `데이터 생성 시각이 ${options.staleWarnDays}일 기준보다 오래되었습니다.`,
      staleIssueSamples,
    ),
  ].filter((issue): issue is DataQualityIssue => issue !== null);

  const status = computeStatus({
    datasetMissing,
    missingRequired,
    duplicates,
    rateAnomalies: 0,
    staleDays,
    staleWarnDays: options.staleWarnDays,
  });

  return {
    datasetId: "dart:corp-index",
    label: "DART Company Index",
    checkedAt: now.toISOString(),
    status,
    ...(typeof staleDays === "number" ? { staleDays } : {}),
    ...(generatedAt ? { generatedAt } : {}),
    totals: {
      rows: rows.length,
      missingRequired,
      duplicates,
      rateAnomalies: 0,
    },
    issues,
  };
}

function summarizeReport(datasets: DatasetQualityReport[]): ExternalDataQualityReport["summary"] {
  return {
    pass: datasets.filter((row) => row.status === "PASS").length,
    warn: datasets.filter((row) => row.status === "WARN").length,
    fail: datasets.filter((row) => row.status === "FAIL").length,
  };
}

function overallStatus(summary: ExternalDataQualityReport["summary"]): DataQualityStatus {
  if (summary.fail > 0) return "FAIL";
  if (summary.warn > 0) return "WARN";
  return "PASS";
}

export async function runExternalDataQualityChecks(options?: {
  now?: Date;
  persist?: boolean;
}): Promise<ExternalDataQualityReport> {
  const policy = loadOpsPolicy();
  const now = options?.now ?? new Date();
  const checks: DatasetQualityReport[] = [
    evaluateFinlifeSnapshotQuality("finlife:deposit", loadFinlifeSnapshot("deposit" as FinlifeSnapshotKind), {
      now,
      staleWarnDays: policy.dataQuality.finlifeSnapshotStaleWarnDays,
    }),
    evaluateFinlifeSnapshotQuality("finlife:saving", loadFinlifeSnapshot("saving" as FinlifeSnapshotKind), {
      now,
      staleWarnDays: policy.dataQuality.finlifeSnapshotStaleWarnDays,
    }),
    evaluateDartCorpIndexQuality(loadCorpIndex(), {
      now,
      staleWarnDays: policy.dataQuality.dartCorpIndexStaleWarnDays,
    }),
  ];

  const summary = summarizeReport(checks);
  const report: ExternalDataQualityReport = {
    checkedAt: now.toISOString(),
    overallStatus: overallStatus(summary),
    summary,
    datasets: checks,
  };

  if (options?.persist !== false) {
    await atomicWriteJson(DATA_QUALITY_REPORT_PATH, report);
  }

  return report;
}

export async function readLatestExternalDataQualityReport(): Promise<ExternalDataQualityReport | null> {
  try {
    const raw = await fs.readFile(DATA_QUALITY_REPORT_PATH, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const row = parsed as Record<string, unknown>;
    if (!Array.isArray(row.datasets)) return null;
    if (!["PASS", "WARN", "FAIL"].includes(asString(row.overallStatus))) return null;
    return parsed as ExternalDataQualityReport;
  } catch {
    return null;
  }
}

export function buildExternalDataQualityDoctorChecks(report: ExternalDataQualityReport): DoctorCheck[] {
  return report.datasets.map((dataset) => {
    const issueSummary = dataset.issues.map((issue) => `${issue.code}:${issue.count}`).join(", ");
    const baseMessage = issueSummary
      ? `${dataset.label} quality ${dataset.status} (${issueSummary})`
      : `${dataset.label} quality ${dataset.status}`;

    const fixHref = dataset.datasetId.startsWith("finlife")
      ? "/ops/planning"
      : "/ops";

    return {
      id: `data-quality-${dataset.datasetId}`,
      title: `Data Quality · ${dataset.label}`,
      status: dataset.status,
      message: baseMessage,
      fixHref,
      details: {
        checkedAt: dataset.checkedAt,
        generatedAt: dataset.generatedAt,
        staleDays: dataset.staleDays,
        totals: dataset.totals,
        issues: dataset.issues,
      },
    } satisfies DoctorCheck;
  });
}

export function getDataQualityReportPath(): string {
  return DATA_QUALITY_REPORT_PATH;
}
