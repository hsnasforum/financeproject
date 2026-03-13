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

function sanitizeRefFieldsDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeRefFieldsDeep(entry)) as T;
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  const row = value as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(row)) {
    if (key === "ref" && hasNamedRef(entry)) {
      next[key] = sanitizeNamedRef(entry);
      continue;
    }
    next[key] = sanitizeRefFieldsDeep(entry);
  }
  return next as T;
}

export function sanitizeRunBlobForResponse<T>(blob: T): T {
  return sanitizeRefFieldsDeep(blob);
}

export function sanitizeRunRecordForResponse<TRun extends PlanningRunRecord>(run: TRun): TRun {
  return {
    ...run,
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
      ...run.outputs,
      ...(run.outputs.simulate?.ref
        ? {
          simulate: {
            ...run.outputs.simulate,
            ref: sanitizeNamedRef(run.outputs.simulate.ref),
          },
        }
        : {}),
      ...(run.outputs.scenarios?.ref
        ? {
          scenarios: {
            ...run.outputs.scenarios,
            ref: sanitizeNamedRef(run.outputs.scenarios.ref),
          },
        }
        : {}),
      ...(run.outputs.monteCarlo?.ref
        ? {
          monteCarlo: {
            ...run.outputs.monteCarlo,
            ref: sanitizeNamedRef(run.outputs.monteCarlo.ref),
          },
        }
        : {}),
      ...(run.outputs.actions?.ref
        ? {
          actions: {
            ...run.outputs.actions,
            ref: sanitizeNamedRef(run.outputs.actions.ref),
          },
        }
        : {}),
      ...(run.outputs.debtStrategy?.ref
        ? {
          debtStrategy: {
            ...run.outputs.debtStrategy,
            ref: sanitizeNamedRef(run.outputs.debtStrategy.ref),
          },
        }
        : {}),
    },
  };
}
