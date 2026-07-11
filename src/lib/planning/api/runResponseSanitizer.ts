import { type PlanningRunRecord } from "../store/types";

function sanitizeNamedRef<T extends { name: string; path?: string; sizeBytes?: number }>(ref: T): Omit<T, "path"> {
  const { path, ...rest } = ref;
  void path;
  return rest;
}

function hasNamedRef(value: unknown): value is { name: string; path?: string; sizeBytes?: number } {
  return Boolean(
    value
    && typeof value === "object"
    && !Array.isArray(value)
    && typeof (value as { name?: unknown }).name === "string",
  );
}

function sanitizeRefFieldsDeep<T>(value: T, parentKey = ""): T {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeRefFieldsDeep(entry, parentKey)) as T;
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  const row = value as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(row)) {
    if (parentKey === "meta" && key === "idempotency") {
      continue;
    }
    if (key === "ref" && hasNamedRef(entry)) {
      next[key] = sanitizeNamedRef(entry);
      continue;
    }
    next[key] = sanitizeRefFieldsDeep(entry, key);
  }
  return next as T;
}

export function sanitizeRunBlobForResponse<T>(blob: T): T {
  return sanitizeRefFieldsDeep(blob);
}

function sanitizeRunMetaForResponse(meta: PlanningRunRecord["meta"] | undefined): PlanningRunRecord["meta"] {
  const { idempotency, ...publicMeta } = meta ?? {};
  void idempotency;
  return publicMeta;
}

export function sanitizeRunRecordForResponse<TRun extends PlanningRunRecord>(run: TRun): TRun {
  const outputs: PlanningRunRecord["outputs"] = run.outputs ?? {};
  return {
    ...run,
    meta: sanitizeRunMetaForResponse(run.meta),
    ...(run.stages
      ? {
        stages: run.stages.map((stage) => ({
          ...stage,
          ...(stage.outputRef?.ref
            ? {
              outputRef: {
                ...stage.outputRef,
                ref: sanitizeNamedRef(stage.outputRef.ref),
              },
            }
            : {}),
        })),
      }
      : {}),
    outputs: {
      ...outputs,
      ...(outputs.simulate?.ref
        ? {
          simulate: {
            ...outputs.simulate,
            ref: sanitizeNamedRef(outputs.simulate.ref),
          },
        }
        : {}),
      ...(outputs.scenarios?.ref
        ? {
          scenarios: {
            ...outputs.scenarios,
            ref: sanitizeNamedRef(outputs.scenarios.ref),
          },
        }
        : {}),
      ...(outputs.monteCarlo?.ref
        ? {
          monteCarlo: {
            ...outputs.monteCarlo,
            ref: sanitizeNamedRef(outputs.monteCarlo.ref),
          },
        }
        : {}),
      ...(outputs.actions?.ref
        ? {
          actions: {
            ...outputs.actions,
            ref: sanitizeNamedRef(outputs.actions.ref),
          },
        }
        : {}),
      ...(outputs.debtStrategy?.ref
        ? {
          debtStrategy: {
            ...outputs.debtStrategy,
            ref: sanitizeNamedRef(outputs.debtStrategy.ref),
          },
        }
        : {}),
    },
  };
}
