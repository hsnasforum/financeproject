import fs from "node:fs/promises";
import path from "node:path";
import {
  resolveProfileRunBlobsDir,
  resolveRunBlobsDir,
} from "./paths";
import {
  fromStoredPayload,
  readJsonFile,
  toStoredPayload,
  writeJsonAtomic,
} from "./runRecordCodec";
import { type PlanningRunRecord, type PlanningRunStageId } from "./types";

const BLOB_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;

export type RunBlobName = "simulate" | "scenarios" | "monteCarlo" | "actions" | "debtStrategy" | "raw";

export type RunBlobRef = {
  name: RunBlobName;
  path: string;
  sizeBytes: number;
};

type RunForBlobRead = Pick<PlanningRunRecord, "id" | "profileId" | "outputs">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isEngineEnvelopeLike(value: unknown): value is NonNullable<PlanningRunRecord["outputs"]["engine"]> {
  if (!isRecord(value)) return false;
  const stage = asString(value.stage);
  if (stage !== "DEFICIT" && stage !== "DEBT" && stage !== "EMERGENCY" && stage !== "INVEST") return false;
  if (!isRecord(value.financialStatus)) return false;
  if (!isRecord(value.stageDecision)) return false;
  return true;
}

function normalizeRelativePath(absPath: string, baseDir = process.cwd()): string {
  return path.relative(baseDir, absPath).replaceAll("\\", "/");
}

export function pickRunBlobRef(value: unknown): { name: string; path?: string; sizeBytes?: number } | undefined {
  if (!isRecord(value)) return undefined;
  const name = asString(value.name);
  if (!name) return undefined;
  const pathValue = asString(value.path);
  const sizeRaw = Number(value.sizeBytes);
  return {
    name,
    ...(pathValue ? { path: pathValue } : {}),
    ...(Number.isFinite(sizeRaw) ? { sizeBytes: Math.max(0, Math.trunc(sizeRaw)) } : {}),
  };
}

export function normalizeRunBlobName(name: unknown): RunBlobName | null {
  const value = asString(name);
  if (!BLOB_NAME_PATTERN.test(value)) return null;
  if (
    value === "simulate"
    || value === "scenarios"
    || value === "monteCarlo"
    || value === "actions"
    || value === "debtStrategy"
    || value === "raw"
  ) {
    return value;
  }
  return null;
}

export function stageIdToRunBlobName(id: PlanningRunStageId): RunBlobName | null {
  if (id === "simulate") return "simulate";
  if (id === "scenarios") return "scenarios";
  if (id === "monteCarlo") return "monteCarlo";
  if (id === "actions") return "actions";
  if (id === "debt" || id === "debtStrategy") return "debtStrategy";
  return null;
}

export async function writeRunBlob(
  profileId: string,
  runId: string,
  blobName: RunBlobName,
  payload: unknown,
): Promise<RunBlobRef | null> {
  if (!normalizeRunBlobName(blobName)) return null;
  const blobPath = path.join(resolveProfileRunBlobsDir(profileId, runId), `${blobName}.json`);
  await writeJsonAtomic(blobPath, await toStoredPayload(payload));
  const stat = await fs.stat(blobPath).catch(() => null);
  return {
    name: blobName,
    path: normalizeRelativePath(blobPath),
    sizeBytes: stat?.size ?? 0,
  };
}

export async function writeStageBlobs(input: {
  profileId: string;
  runId: string;
  outputs: PlanningRunRecord["outputs"];
}): Promise<Partial<Record<RunBlobName, RunBlobRef>>> {
  const source = asRecord(input.outputs);
  const refs: Partial<Record<RunBlobName, RunBlobRef>> = {};
  const stages: Array<Exclude<RunBlobName, "raw">> = [
    "simulate",
    "scenarios",
    "monteCarlo",
    "actions",
    "debtStrategy",
  ];

  for (const blobName of stages) {
    const payload = source[blobName];
    if (!isRecord(payload)) continue;
    refs[blobName] = await writeRunBlob(input.profileId, input.runId, blobName, payload) ?? undefined;
  }

  return refs;
}

function outputForBlob(run: RunForBlobRead, blobName: RunBlobName): unknown | null {
  if (blobName === "simulate") return run.outputs.simulate ?? null;
  if (blobName === "scenarios") return run.outputs.scenarios ?? null;
  if (blobName === "monteCarlo") return run.outputs.monteCarlo ?? null;
  if (blobName === "actions") return run.outputs.actions ?? null;
  if (blobName === "debtStrategy") return run.outputs.debtStrategy ?? null;
  if (blobName === "raw") {
    return {
      run,
      outputs: {
        simulate: run.outputs.simulate,
        scenarios: run.outputs.scenarios,
        monteCarlo: run.outputs.monteCarlo,
        actions: run.outputs.actions,
        debtStrategy: run.outputs.debtStrategy,
      },
    };
  }
  return null;
}

export async function readRunBlobPayload(input: {
  runId: string;
  blobName: RunBlobName;
  run?: RunForBlobRead | null;
  fallbackRun?: RunForBlobRead | null;
}): Promise<unknown | null> {
  if (!normalizeRunBlobName(input.blobName)) return null;
  const blobPath = input.run
    ? path.join(resolveProfileRunBlobsDir(input.run.profileId, input.run.id), `${input.blobName}.json`)
    : path.join(resolveRunBlobsDir(input.runId), `${input.blobName}.json`);
  const loaded = await readJsonFile(blobPath);
  if (loaded !== null) {
    const decoded = await fromStoredPayload(loaded);
    return decoded.payload;
  }

  const fallbackRun = input.fallbackRun ?? input.run ?? null;
  if (!fallbackRun) return null;
  return outputForBlob(fallbackRun, input.blobName);
}

function attachBlobRef<T extends Record<string, unknown>>(
  value: T | undefined,
  ref: RunBlobRef | null,
): T | undefined {
  if (!value) return undefined;
  if (!ref) return value;
  return {
    ...value,
    ref: {
      name: ref.name,
      path: ref.path,
      ...(typeof ref.sizeBytes === "number" ? { sizeBytes: ref.sizeBytes } : {}),
    },
  };
}

function refOnly(ref: RunBlobRef | undefined): { ref: { name: RunBlobName; path: string; sizeBytes?: number } } | undefined {
  if (!ref) return undefined;
  return {
    ref: {
      name: ref.name,
      path: ref.path,
      ...(typeof ref.sizeBytes === "number" ? { sizeBytes: ref.sizeBytes } : {}),
    },
  };
}

export function withStageBlobRefs(
  outputs: PlanningRunRecord["outputs"],
  refs: Partial<Record<RunBlobName, RunBlobRef>>,
): PlanningRunRecord["outputs"] {
  const source = asRecord(outputs);
  const rawEngineSchemaVersion = Math.trunc(Number(source.engineSchemaVersion));
  const engineSchemaVersion = Number.isFinite(rawEngineSchemaVersion) && rawEngineSchemaVersion >= 1
    ? rawEngineSchemaVersion
    : undefined;
  const simulateRef = refOnly(refs.simulate);
  const scenariosRef = refOnly(refs.scenarios);
  const monteRef = refOnly(refs.monteCarlo);
  const actionsRef = refOnly(refs.actions);
  const debtRef = refOnly(refs.debtStrategy);

  return {
    ...(typeof engineSchemaVersion === "number" ? { engineSchemaVersion } : {}),
    ...(isEngineEnvelopeLike(source.engine) ? { engine: source.engine } : {}),
    ...(source.resultDto !== undefined ? { resultDto: source.resultDto as PlanningRunRecord["outputs"]["resultDto"] } : {}),
    ...(isRecord(source.simulate)
      ? {
        simulate: attachBlobRef(
          source.simulate as PlanningRunRecord["outputs"]["simulate"],
          refs.simulate ?? null,
        ),
      }
      : (simulateRef ? { simulate: simulateRef } : {})),
    ...(isRecord(source.scenarios)
      ? {
        scenarios: attachBlobRef(
          source.scenarios as PlanningRunRecord["outputs"]["scenarios"],
          refs.scenarios ?? null,
        ),
      }
      : (scenariosRef ? { scenarios: scenariosRef } : {})),
    ...(isRecord(source.monteCarlo)
      ? {
        monteCarlo: attachBlobRef(
          source.monteCarlo as PlanningRunRecord["outputs"]["monteCarlo"],
          refs.monteCarlo ?? null,
        ),
      }
      : (monteRef ? { monteCarlo: monteRef } : {})),
    ...(isRecord(source.actions)
      ? {
        actions: attachBlobRef(
          source.actions as PlanningRunRecord["outputs"]["actions"],
          refs.actions ?? null,
        ),
      }
      : (actionsRef ? { actions: actionsRef } : {})),
    ...(isRecord(source.debtStrategy)
      ? {
        debtStrategy: attachBlobRef(
          source.debtStrategy as PlanningRunRecord["outputs"]["debtStrategy"],
          refs.debtStrategy ?? null,
        ),
      }
      : (debtRef ? { debtStrategy: debtRef } : {})),
  };
}

export function withStageOutputRefs(
  stages: PlanningRunRecord["stages"],
  refs: Partial<Record<RunBlobName, RunBlobRef>>,
): PlanningRunRecord["stages"] {
  if (!Array.isArray(stages)) return stages;
  return stages.map((stage) => {
    const blobName = stageIdToRunBlobName(stage.id);
    if (!blobName) return stage;
    const ref = refs[blobName];
    if (!ref || !stage.outputRef) return stage;
    return {
      ...stage,
      outputRef: {
        ...stage.outputRef,
        ref: {
          name: ref.name,
          path: ref.path,
          ...(typeof ref.sizeBytes === "number" ? { sizeBytes: ref.sizeBytes } : {}),
        },
      },
    };
  });
}
