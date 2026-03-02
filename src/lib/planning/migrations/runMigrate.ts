import { LATEST_RUN_VERSION } from "./versions.ts";
import { type MigrationResult } from "./types.ts";
import { RUN_SCHEMA_VERSION } from "../v2/schemaVersion.ts";

type RunSnapshotMetaLike = {
  id?: string;
  asOf?: string;
  fetchedAt?: string;
  missing?: boolean;
  warningsCount?: number;
  sourcesCount?: number;
};

type RunHealthMetaLike = {
  warningsCodes: string[];
  criticalCount: number;
  snapshotStaleDays?: number;
};

type PlanningRunRecordLike = {
  version: 1;
  schemaVersion?: 2;
  id: string;
  profileId: string;
  title?: string;
  createdAt: string;
  input: {
    horizonMonths: number;
    snapshotId?: string;
    assumptionsOverride?: Record<string, unknown>;
    runScenarios?: boolean;
    getActions?: boolean;
    analyzeDebt?: boolean;
    includeProducts?: boolean;
    debtStrategy?: Record<string, unknown>;
    monteCarlo?: Record<string, unknown>;
  };
  meta: {
    snapshot?: RunSnapshotMetaLike;
    health?: RunHealthMetaLike;
  };
  outputs: {
    simulate?: {
      summary: Record<string, unknown>;
      warnings: string[];
      goalsStatus: unknown;
      keyTimelinePoints: unknown;
    };
    scenarios?: {
      table: unknown;
      shortWhyByScenario: unknown;
    };
    monteCarlo?: {
      probabilities: unknown;
      percentiles: unknown;
      notes: string[];
    };
    actions?: {
      actions: unknown[];
    };
    debtStrategy?: {
      summary: Record<string, unknown>;
      warnings: Array<{ code: string; message: string }>;
      summaries: unknown;
      refinance?: unknown;
      whatIf?: unknown;
    };
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readVersion(value: unknown): number {
  if (!isRecord(value)) return 0;
  const parsed = Math.trunc(Number(value.version));
  if (!Number.isFinite(parsed) || parsed < 1) return 0;
  return parsed;
}

function toWarningCodes(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const codes = new Set<string>();
  for (const row of input) {
    if (typeof row === "string") {
      const code = row.trim();
      if (code) codes.add(code);
      continue;
    }
    if (isRecord(row)) {
      const code = asString(row.code || row.reasonCode);
      if (code) codes.add(code);
    }
  }
  return [...codes].sort((a, b) => a.localeCompare(b));
}

function toHealthWarningCodes(input: unknown): string[] {
  if (Array.isArray(input)) {
    return toWarningCodes(input);
  }
  if (isRecord(input) && Array.isArray(input.warningsCodes)) {
    return toWarningCodes(input.warningsCodes);
  }
  return [];
}

function toNotes(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const row of input) {
    if (typeof row !== "string") continue;
    const text = row.trim();
    if (!text) continue;
    out.push(text);
  }
  return out;
}

function toDebtWarnings(input: unknown): Array<{ code: string; message: string }> {
  if (!Array.isArray(input)) return [];
  const out: Array<{ code: string; message: string }> = [];
  for (const row of input) {
    if (!isRecord(row)) continue;
    const code = asString(row.code || row.reasonCode);
    const message = asString(row.message) || code;
    if (!code) continue;
    out.push({ code, message });
  }
  return out;
}

function failRun(fromVersion: number, errors: string[], warnings: string[] = []): MigrationResult<PlanningRunRecordLike> {
  return {
    ok: false,
    fromVersion,
    toVersion: LATEST_RUN_VERSION,
    changed: false,
    warnings,
    errors,
  };
}

export function migrateRunRecord(input: unknown): MigrationResult<PlanningRunRecordLike> {
  const fromVersion = readVersion(input);
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!isRecord(input)) {
    return failRun(fromVersion, ["INVALID_RECORD_OBJECT"]);
  }

  const id = asString(input.id);
  if (!id) errors.push("MISSING_ID");

  const profileId = asString(input.profileId);
  if (!profileId) errors.push("MISSING_PROFILE_ID");

  const createdAt = asString(input.createdAt);
  if (!createdAt || !Number.isFinite(Date.parse(createdAt))) {
    errors.push("MISSING_DATE_CREATED_AT");
  }

  if (!isRecord(input.input)) errors.push("MISSING_INPUT");
  if (!isRecord(input.meta)) errors.push("MISSING_META");
  if (!isRecord(input.outputs)) errors.push("MISSING_OUTPUTS");

  if (fromVersion < 1) {
    warnings.push("VERSION_MISSING_DEFAULTED");
  }

  if (errors.length > 0) {
    return failRun(fromVersion, errors, warnings);
  }

  const inputRecord = input.input as Record<string, unknown>;
  const rawHorizon = Math.trunc(Number(inputRecord.horizonMonths));
  if (!Number.isFinite(rawHorizon) || rawHorizon < 1) {
    return failRun(fromVersion, ["MISSING_INPUT_HORIZON_MONTHS"], warnings);
  }

  const metaRecord = input.meta as Record<string, unknown>;
  const snapshotRecord = isRecord(metaRecord.snapshot) ? metaRecord.snapshot : {};
  if (!asString(snapshotRecord.id) && (asString(snapshotRecord.asOf) || asString(snapshotRecord.fetchedAt))) {
    warnings.push("SNAPSHOT_ID_MISSING");
  }

  const outputsRecord = input.outputs as Record<string, unknown>;
  const simulateRecord = isRecord(outputsRecord.simulate) ? outputsRecord.simulate : {};
  const scenariosRecord = isRecord(outputsRecord.scenarios) ? outputsRecord.scenarios : {};
  const monteCarloRecord = isRecord(outputsRecord.monteCarlo) ? outputsRecord.monteCarlo : {};
  const actionsRecord = isRecord(outputsRecord.actions) ? outputsRecord.actions : {};
  const debtRecord = isRecord(outputsRecord.debtStrategy) ? outputsRecord.debtStrategy : {};
  const healthRecord = isRecord(metaRecord.health) ? metaRecord.health : {};

  const normalizedWarnings = toWarningCodes(simulateRecord.warnings);
  const normalizedActions = Array.isArray(actionsRecord.actions) ? actionsRecord.actions : [];
  const normalizedDebtWarnings = toDebtWarnings(debtRecord.warnings);

  const data: PlanningRunRecordLike = {
    version: LATEST_RUN_VERSION,
    schemaVersion: RUN_SCHEMA_VERSION,
    id,
    profileId,
    ...(asString(input.title) ? { title: asString(input.title) } : {}),
    createdAt: new Date(createdAt).toISOString(),
    input: {
      horizonMonths: rawHorizon,
      ...(asString(inputRecord.snapshotId) ? { snapshotId: asString(inputRecord.snapshotId) } : {}),
      ...(isRecord(inputRecord.assumptionsOverride) ? { assumptionsOverride: inputRecord.assumptionsOverride as PlanningRunRecordLike["input"]["assumptionsOverride"] } : {}),
      ...(typeof inputRecord.runScenarios === "boolean" ? { runScenarios: inputRecord.runScenarios } : {}),
      ...(typeof inputRecord.getActions === "boolean" ? { getActions: inputRecord.getActions } : {}),
      ...(typeof inputRecord.analyzeDebt === "boolean" ? { analyzeDebt: inputRecord.analyzeDebt } : {}),
      ...(isRecord(inputRecord.debtStrategy) ? { debtStrategy: inputRecord.debtStrategy as PlanningRunRecordLike["input"]["debtStrategy"] } : {}),
      ...(typeof inputRecord.includeProducts === "boolean" ? { includeProducts: inputRecord.includeProducts } : {}),
      ...(isRecord(inputRecord.monteCarlo) ? { monteCarlo: inputRecord.monteCarlo as PlanningRunRecordLike["input"]["monteCarlo"] } : {}),
    },
    meta: {
      ...(isRecord(metaRecord.snapshot)
        ? {
          snapshot: {
            ...(asString(snapshotRecord.id) ? { id: asString(snapshotRecord.id) } : {}),
            ...(asString(snapshotRecord.asOf) ? { asOf: asString(snapshotRecord.asOf) } : {}),
            ...(asString(snapshotRecord.fetchedAt) ? { fetchedAt: asString(snapshotRecord.fetchedAt) } : {}),
            ...(typeof snapshotRecord.missing === "boolean" ? { missing: snapshotRecord.missing } : {}),
            ...(Number.isFinite(Number(snapshotRecord.warningsCount)) ? { warningsCount: Math.trunc(Number(snapshotRecord.warningsCount)) } : {}),
            ...(Number.isFinite(Number(snapshotRecord.sourcesCount)) ? { sourcesCount: Math.trunc(Number(snapshotRecord.sourcesCount)) } : {}),
          },
        }
        : {}),
      ...(isRecord(metaRecord.health)
        ? {
          health: {
            warningsCodes: toHealthWarningCodes(healthRecord.warningsCodes),
            criticalCount: Number.isFinite(Number(healthRecord.criticalCount)) ? Math.max(0, Math.trunc(Number(healthRecord.criticalCount))) : 0,
            ...(Number.isFinite(Number(healthRecord.snapshotStaleDays)) ? { snapshotStaleDays: Math.max(0, Math.trunc(Number(healthRecord.snapshotStaleDays))) } : {}),
          },
        }
        : {}),
    },
    outputs: {
      ...(isRecord(outputsRecord.simulate)
        ? {
          simulate: {
            summary: isRecord(simulateRecord.summary) ? simulateRecord.summary : {},
            warnings: normalizedWarnings,
            goalsStatus: simulateRecord.goalsStatus ?? [],
            keyTimelinePoints: simulateRecord.keyTimelinePoints ?? [],
          },
        }
        : {}),
      ...(isRecord(outputsRecord.scenarios)
        ? {
          scenarios: {
            table: scenariosRecord.table ?? [],
            shortWhyByScenario: scenariosRecord.shortWhyByScenario ?? {},
          },
        }
        : {}),
      ...(isRecord(outputsRecord.monteCarlo)
        ? {
          monteCarlo: {
            probabilities: monteCarloRecord.probabilities ?? {},
            percentiles: monteCarloRecord.percentiles ?? {},
            notes: toNotes(monteCarloRecord.notes),
          },
        }
        : {}),
      ...(isRecord(outputsRecord.actions)
        ? {
          actions: {
            actions: normalizedActions as NonNullable<PlanningRunRecordLike["outputs"]["actions"]>["actions"],
          },
        }
        : {}),
      ...(isRecord(outputsRecord.debtStrategy)
        ? {
          debtStrategy: {
            summary: isRecord(debtRecord.summary) ? debtRecord.summary : {},
            warnings: normalizedDebtWarnings,
            summaries: debtRecord.summaries ?? [],
            ...(debtRecord.refinance !== undefined ? { refinance: debtRecord.refinance } : {}),
            ...(debtRecord.whatIf !== undefined ? { whatIf: debtRecord.whatIf } : {}),
          },
        }
        : {}),
    },
  };

  const changed = fromVersion < LATEST_RUN_VERSION || JSON.stringify(data) !== JSON.stringify(input);

  return {
    ok: true,
    fromVersion,
    toVersion: LATEST_RUN_VERSION,
    changed,
    data,
    warnings,
    errors: [],
  };
}
