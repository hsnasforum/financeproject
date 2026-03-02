import { type PlanningRunRecord } from "../store/types";
import { RUN_SCHEMA_VERSION } from "./schemaVersion";

type CanonicalRunLoadResult = {
  schemaVersion: 2;
  migratedFrom?: number;
  run: PlanningRunRecord;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStageId(value: unknown): string {
  const id = asString(value);
  if (id === "debt") return "debtStrategy";
  return id;
}

function normalizeStages(value: unknown): PlanningRunRecord["stages"] {
  if (!Array.isArray(value)) return undefined;
  return value
    .map((entry) => {
      const row = asRecord(entry);
      const id = normalizeStageId(row.id);
      if (!id) return null;
      return {
        ...(row as PlanningRunRecord["stages"][number]),
        id: id as PlanningRunRecord["stages"][number]["id"],
      };
    })
    .filter((entry): entry is PlanningRunRecord["stages"][number] => entry !== null);
}

function readSchemaVersion(value: Record<string, unknown>): number {
  const raw = Math.trunc(Number(value.schemaVersion));
  if (!Number.isFinite(raw)) return 0;
  return raw;
}

function assertCanonicalRunShape(input: Record<string, unknown>): void {
  const id = asString(input.id);
  const profileId = asString(input.profileId);
  const createdAt = asString(input.createdAt);
  const version = Math.trunc(Number(input.version));

  if (version !== 1) {
    throw new Error("RUN_VERSION_INVALID");
  }
  if (!id) {
    throw new Error("RUN_ID_MISSING");
  }
  if (!profileId) {
    throw new Error("RUN_PROFILE_ID_MISSING");
  }
  if (!createdAt || !Number.isFinite(Date.parse(createdAt))) {
    throw new Error("RUN_CREATED_AT_INVALID");
  }
  if (!isRecord(input.input)) {
    throw new Error("RUN_INPUT_MISSING");
  }
  if (!isRecord(input.meta)) {
    throw new Error("RUN_META_MISSING");
  }
  if (!isRecord(input.outputs)) {
    throw new Error("RUN_OUTPUTS_MISSING");
  }
}

export function migrateRun(raw: unknown): PlanningRunRecord {
  if (!isRecord(raw)) {
    throw new Error("RUN_RECORD_INVALID");
  }

  const schemaVersion = readSchemaVersion(raw);
  if (schemaVersion > RUN_SCHEMA_VERSION) {
    throw new Error(`RUN_SCHEMA_VERSION_UNSUPPORTED:${schemaVersion}`);
  }

  const next: PlanningRunRecord = {
    ...(raw as PlanningRunRecord),
    version: 1,
    schemaVersion: RUN_SCHEMA_VERSION,
    id: asString(raw.id),
    profileId: asString(raw.profileId),
    createdAt: new Date(asString(raw.createdAt)).toISOString(),
    ...(asString(raw.title) ? { title: asString(raw.title) } : {}),
    input: asRecord(raw.input) as PlanningRunRecord["input"],
    meta: asRecord(raw.meta) as PlanningRunRecord["meta"],
    outputs: asRecord(raw.outputs) as PlanningRunRecord["outputs"],
    ...(Array.isArray(raw.stages) ? { stages: normalizeStages(raw.stages) } : {}),
    ...(typeof raw.overallStatus === "string" ? { overallStatus: raw.overallStatus as PlanningRunRecord["overallStatus"] } : {}),
    ...(isRecord(raw.reproducibility) ? { reproducibility: raw.reproducibility as PlanningRunRecord["reproducibility"] } : {}),
  };

  assertCanonicalRunShape(next as unknown as Record<string, unknown>);
  return next;
}

export function loadCanonicalRun(raw: unknown): CanonicalRunLoadResult {
  const source = asRecord(raw);
  const schemaVersion = readSchemaVersion(source);
  const migratedFrom = schemaVersion > 0 && schemaVersion < RUN_SCHEMA_VERSION
    ? schemaVersion
    : (schemaVersion === 0 ? 1 : undefined);
  const run = migrateRun(raw);
  return {
    schemaVersion: RUN_SCHEMA_VERSION,
    ...(typeof migratedFrom === "number" ? { migratedFrom } : {}),
    run,
  };
}
