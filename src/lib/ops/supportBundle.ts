import fs from "node:fs/promises";
import path from "node:path";
import { encodeZip, type ZipFileEntry } from "./backup/zipCodec";
import { buildDataSourceImpactOperatorCardSummaries } from "../dataSources/impactHealth";
import { buildDataSourceImpactBundleSummary, loadDataSourceImpactSnapshot } from "../dataSources/impactSnapshot";
import { listOpsMetricEvents, summarizeOpsMetricEvents } from "./metricsLog";
import { loadOpsPolicy } from "./opsPolicy";
import { listOpsAuditEvents } from "./securityAuditLog";
import { redactText } from "../planning/privacy/redact";
import { DEFAULT_PLANNING_POLICY } from "../planning/catalog/planningPolicy";
import { DEFAULT_INTEREST_TAX_POLICY } from "../planning/calc/taxPolicy";
import { ROUNDING_POLICY } from "../planning/calc/roundingPolicy";
import { getPlanningMigrationStatePath, inspectPlanningMigrations } from "../planning/migrations/manager";
import type { PlanningAppInfo } from "../planning/server/runtime/appInfo";

type DoctorPayloadLike = {
  ok?: unknown;
  data?: unknown;
  meta?: unknown;
  error?: unknown;
};

type SupportBundleBuildInput = {
  doctorPayload: unknown;
  appInfo: PlanningAppInfo;
  now?: Date;
};

type SupportBundleOutput = {
  fileName: string;
  bytes: Buffer;
  manifest: {
    kind: "planning-support-bundle";
    formatVersion: 1;
    createdAt: string;
    appVersion: string;
    engineVersion: string;
    includes: string[];
    excludes: string[];
    counts: {
      doctorChecks: number;
      migrationItems: number;
      auditEvents: number;
      metricEvents: number;
    };
  };
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed;
}

function asBool(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const normalized = asString(value).toLowerCase();
  if (!normalized) return undefined;
  if (normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on") return true;
  if (normalized === "false" || normalized === "0" || normalized === "no" || normalized === "off") return false;
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function toIso(value: unknown, fallback = new Date().toISOString()): string {
  const raw = asString(value);
  const parsed = Date.parse(raw);
  if (!raw || !Number.isFinite(parsed)) return fallback;
  return new Date(parsed).toISOString();
}

function truncateIdentifier(value: unknown, length = 8): string | undefined {
  const raw = asString(value);
  if (!raw) return undefined;
  return raw.slice(0, Math.max(1, length));
}

function sanitizeForBundle(value: unknown, keyHint = "", depth = 0): unknown {
  if (depth > 8) return "[TRUNCATED]";
  const sensitiveKey = /(passphrase|password|secret|token|api[_-]?key|authorization|cookie|env|profile\.|run\.|blob|raw|outputs?)/i;
  if (sensitiveKey.test(keyHint)) return "[REDACTED]";

  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    const redacted = redactText(value);
    if (
      /incomeNet|monthlyIncomeNet|monthlyEssentialExpenses|monthlyDiscretionaryExpenses|liquidAssets|investmentAssets|aprPct|newAprPct|debt|debts|process\.env/i.test(
        redacted,
      )
    ) {
      return "[REDACTED]";
    }
    return redacted.slice(0, 2000);
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.slice(0, 200).map((entry) => sanitizeForBundle(entry, keyHint, depth + 1));
  }
  if (typeof value === "object") {
    const row = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(row).slice(0, 200)) {
      out[key] = sanitizeForBundle(entry, key, depth + 1);
    }
    return out;
  }
  return sanitizeForBundle(String(value), keyHint, depth + 1);
}

function compactDoctorPayload(input: unknown): {
  ok: boolean;
  generatedAt: string;
  summary: {
    pass: number;
    warn: number;
    fail: number;
  };
  checks: Array<{
    id: string;
    title: string;
    status: string;
    message: string;
    fixHref?: string;
  }>;
  meta: {
    migrationResult?: string;
    migrationSummary?: Record<string, number>;
    recoveryApplied?: number;
    recoveryIssues?: number;
  };
  error?: {
    code?: string;
    message?: string;
  };
} {
  const payload = asRecord(input as DoctorPayloadLike);
  const report = asRecord(payload.data);
  const summary = asRecord(report.summary);
  const checks = asArray(report.checks).slice(0, 200).map((entry) => {
    const row = asRecord(entry);
    const fixHref = asString(row.fixHref);
    return {
      id: asString(row.id) || "unknown",
      title: asString(row.title) || "Untitled check",
      status: asString(row.status) || "UNKNOWN",
      message: asString(row.message) || "",
      ...(fixHref ? { fixHref } : {}),
    };
  });

  const meta = asRecord(payload.meta);
  const migration = asRecord(meta.migration);
  const migrationSummary = asRecord(migration.summary);
  const recovery = asRecord(meta.recovery);

  const error = asRecord(payload.error);
  const errorCode = asString(error.code);
  const errorMessage = asString(error.message);

  return {
    ok: asBool(report.ok) ?? asBool(payload.ok) ?? false,
    generatedAt: toIso(report.generatedAt),
    summary: {
      pass: Math.max(0, Math.trunc(asNumber(summary.pass) ?? 0)),
      warn: Math.max(0, Math.trunc(asNumber(summary.warn) ?? 0)),
      fail: Math.max(0, Math.trunc(asNumber(summary.fail) ?? 0)),
    },
    checks,
    meta: {
      ...(asString(migration.result) ? { migrationResult: asString(migration.result) } : {}),
      ...(Object.keys(migrationSummary).length > 0
        ? {
          migrationSummary: {
            applied: Math.max(0, Math.trunc(asNumber(migrationSummary.applied) ?? 0)),
            pending: Math.max(0, Math.trunc(asNumber(migrationSummary.pending) ?? 0)),
            deferred: Math.max(0, Math.trunc(asNumber(migrationSummary.deferred) ?? 0)),
            failed: Math.max(0, Math.trunc(asNumber(migrationSummary.failed) ?? 0)),
          },
        }
        : {}),
      ...(asNumber(recovery.replayed) !== undefined ? { recoveryApplied: Math.max(0, Math.trunc(asNumber(recovery.replayed) ?? 0)) } : {}),
      ...(asArray(recovery.issues).length > 0 ? { recoveryIssues: asArray(recovery.issues).length } : {}),
    },
    ...((errorCode || errorMessage)
      ? {
        error: {
          ...(errorCode ? { code: errorCode } : {}),
          ...(errorMessage ? { message: errorMessage } : {}),
        },
      }
      : {}),
  };
}

async function readMigrationStateCompact(statePath: string): Promise<{
  statePath: string;
  stateExists: boolean;
  lastAttempt?: {
    at: string;
    trigger: string;
    result: string;
  };
  migrations: Array<{
    id: string;
    status: string;
    attempts: number;
    appliedAt?: string;
    lastAttemptAt?: string;
    lastErrorCode?: string;
  }>;
}> {
  try {
    const parsed = JSON.parse(await fs.readFile(statePath, "utf-8")) as unknown;
    const row = asRecord(parsed);
    const migrationsRow = asRecord(row.migrations);
    const migrations = Object.entries(migrationsRow)
      .slice(0, 200)
      .map(([id, item]) => {
        const migration = asRecord(item);
        const appliedAt = asString(migration.appliedAt);
        const lastAttemptAt = asString(migration.lastAttemptAt);
        const lastError = asRecord(migration.lastError);
        const lastErrorCode = asString(lastError.code);
        return {
          id,
          status: asString(migration.status) || "unknown",
          attempts: Math.max(0, Math.trunc(asNumber(migration.attempts) ?? 0)),
          ...(appliedAt ? { appliedAt: toIso(appliedAt) } : {}),
          ...(lastAttemptAt ? { lastAttemptAt: toIso(lastAttemptAt) } : {}),
          ...(lastErrorCode ? { lastErrorCode } : {}),
        };
      })
      .sort((a, b) => a.id.localeCompare(b.id));

    const lastAttemptRow = asRecord(row.lastAttempt);
    const trigger = asString(lastAttemptRow.trigger);
    const result = asString(lastAttemptRow.result);
    const at = asString(lastAttemptRow.at);

    return {
      statePath: path.relative(process.cwd(), statePath).replaceAll("\\", "/"),
      stateExists: true,
      ...(at
        ? {
          lastAttempt: {
            at: toIso(at),
            trigger: trigger || "unknown",
            result: result || "unknown",
          },
        }
        : {}),
      migrations,
    };
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") {
      return {
        statePath: path.relative(process.cwd(), statePath).replaceAll("\\", "/"),
        stateExists: false,
        migrations: [],
      };
    }
    return {
      statePath: path.relative(process.cwd(), statePath).replaceAll("\\", "/"),
      stateExists: true,
      migrations: [],
    };
  }
}

function summarizeAuditEvents(events: Array<{ eventType: string; at: string; meta?: Record<string, unknown> }>): {
  total: number;
  byType: Record<string, number>;
  recent: Array<{
    eventType: string;
    at: string;
    metaKeys: string[];
  }>;
} {
  const byType: Record<string, number> = {};
  for (const event of events) {
    const key = asString(event.eventType) || "UNKNOWN";
    byType[key] = (byType[key] ?? 0) + 1;
  }

  return {
    total: events.length,
    byType,
    recent: events.slice(0, 80).map((event) => ({
      eventType: asString(event.eventType) || "UNKNOWN",
      at: toIso(event.at),
      metaKeys: Object.keys(asRecord(event.meta)).slice(0, 20),
    })),
  };
}

function summarizeMetricEvents(events: Array<{ type: string; at: string; meta?: Record<string, unknown> }>): {
  total: number;
  byType: Record<string, number>;
  recent: Array<{
    type: string;
    at: string;
    status: string;
    durationMs?: number;
    code?: string;
  }>;
} {
  const byType: Record<string, number> = {};
  for (const event of events) {
    const key = asString(event.type) || "UNKNOWN";
    byType[key] = (byType[key] ?? 0) + 1;
  }

  return {
    total: events.length,
    byType,
    recent: events.slice(0, 120).map((event) => {
      const meta = asRecord(event.meta);
      const durationMs = asNumber(meta.durationMs);
      const code = asString(meta.code);
      return {
        type: asString(event.type) || "UNKNOWN",
        at: toIso(event.at),
        status: asString(meta.status) || "UNKNOWN",
        ...(typeof durationMs === "number" ? { durationMs: Math.max(0, Math.trunc(durationMs)) } : {}),
        ...(code ? { code } : {}),
      };
    }),
  };
}

function buildMetricsRecent(events: Array<{ type: string; at: string; meta?: Record<string, unknown> }>): Array<{
  type: string;
  at: string;
  status?: string;
  stage?: string;
  durationMs?: number;
  errorCode?: string;
  runIdPrefix?: string;
  profileIdPrefix?: string;
}> {
  return events.slice(0, 200).map((event) => {
    const meta = asRecord(event.meta);
    const stage = asString(meta.stage || meta.stageId);
    const durationMs = asNumber(meta.durationMs);
    const status = asString(meta.status);
    const errorCode = asString(meta.code || meta.errorCode);
    const runIdPrefix = truncateIdentifier(meta.runId);
    const profileIdPrefix = truncateIdentifier(meta.profileId);

    return {
      type: asString(event.type) || "UNKNOWN",
      at: toIso(event.at),
      ...(status ? { status } : {}),
      ...(stage ? { stage } : {}),
      ...(typeof durationMs === "number" ? { durationMs: Math.max(0, Math.trunc(durationMs)) } : {}),
      ...(errorCode ? { errorCode } : {}),
      ...(runIdPrefix ? { runIdPrefix } : {}),
      ...(profileIdPrefix ? { profileIdPrefix } : {}),
    };
  });
}

async function buildDataSourceImpactSummary() {
  const snapshot = await loadDataSourceImpactSnapshot();
  const bundleSummary = buildDataSourceImpactBundleSummary(snapshot);

  return {
    sources: bundleSummary.sources,
    cards: buildDataSourceImpactOperatorCardSummaries({
      impactHealthByCardId: bundleSummary.cards.healthSummaryByCardId,
      impactReadOnlyByCardId: bundleSummary.cards.readOnlyHealthByCardId,
    }),
  };
}

export async function buildSupportBundle(input: SupportBundleBuildInput): Promise<SupportBundleOutput> {
  const now = input.now ?? new Date();
  const createdAt = now.toISOString();
  const stamp = createdAt.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

  const [migrationInspect, auditEvents, metricEvents, dataSourceImpactSummary] = await Promise.all([
    inspectPlanningMigrations(),
    listOpsAuditEvents({ limit: 400 }),
    listOpsMetricEvents({ limit: 1200 }),
    buildDataSourceImpactSummary(),
  ]);

  const migrationState = await readMigrationStateCompact(getPlanningMigrationStatePath());
  const doctor = compactDoctorPayload(input.doctorPayload);
  const audit = summarizeAuditEvents(auditEvents);
  const metrics = {
    summary: summarizeOpsMetricEvents(metricEvents),
    ...summarizeMetricEvents(metricEvents),
  };
  const metricsRecent = buildMetricsRecent(metricEvents);

  const policySnapshot = {
    opsPolicy: loadOpsPolicy(),
    planningPolicy: DEFAULT_PLANNING_POLICY,
    calcPolicy: {
      tax: DEFAULT_INTEREST_TAX_POLICY,
      rounding: ROUNDING_POLICY,
    },
  };

  const includes = [
    "doctor.json",
    "app.json",
    "policy.json",
    "metrics_summary.json",
    "metrics_recent.json",
    "data_source_impact_summary.json",
  ];
  if (audit.total > 0) includes.push("audit_summary.json");
  if (migrationState.stateExists) includes.push("migration_state.json");

  const manifest: SupportBundleOutput["manifest"] = {
    kind: "planning-support-bundle",
    formatVersion: 1,
    createdAt,
    appVersion: input.appInfo.appVersion,
    engineVersion: input.appInfo.engineVersion,
    includes,
    excludes: [
      "profiles/*",
      "runs/*",
      "run blobs",
      "vault secrets / passphrases / env values",
      "raw upstream payloads",
    ],
    counts: {
      doctorChecks: doctor.checks.length,
      migrationItems: migrationInspect.items.length,
      auditEvents: audit.total,
      metricEvents: metrics.total,
    },
  };

  const payloads: Record<string, unknown> = {
    "manifest.json": manifest,
    "doctor.json": {
      createdAt,
      source: "api/ops/doctor",
      report: doctor,
    },
    "app.json": {
      createdAt,
      appVersion: input.appInfo.appVersion,
      engineVersion: input.appInfo.engineVersion,
      dataDir: input.appInfo.dataDir,
      hostPolicy: input.appInfo.hostPolicy,
    },
    "policy.json": {
      createdAt,
      ...policySnapshot,
    },
    "metrics_summary.json": {
      createdAt,
      ...metrics,
    },
    "metrics_recent.json": {
      createdAt,
      events: metricsRecent,
    },
    "data_source_impact_summary.json": {
      createdAt,
      source: "/settings/data-sources",
      sources: dataSourceImpactSummary.sources,
      cards: dataSourceImpactSummary.cards,
    },
  };

  if (audit.total > 0) {
    payloads["audit_summary.json"] = {
      createdAt,
      ...audit,
    };
  }

  if (migrationState.stateExists) {
    payloads["migration_state.json"] = {
      createdAt,
      inspect: {
        generatedAt: migrationInspect.generatedAt,
        summary: migrationInspect.summary,
        items: migrationInspect.items.map((item) => ({
          id: item.id,
          title: item.title,
          status: item.status,
          code: item.code,
          message: item.message,
          fixHref: item.fixHref,
          requiresVaultUnlocked: item.requiresVaultUnlocked,
        })),
      },
      state: migrationState,
    };
  }

  const zipEntries: ZipFileEntry[] = Object.entries(payloads).map(([entryPath, value]) => {
    const sanitized = sanitizeForBundle(value);
    return {
      path: entryPath,
      bytes: Buffer.from(`${JSON.stringify(sanitized, null, 2)}\n`, "utf-8"),
    };
  });

  return {
    fileName: `planning-support-bundle-${stamp}.zip`,
    bytes: encodeZip(zipEntries),
    manifest,
  };
}
