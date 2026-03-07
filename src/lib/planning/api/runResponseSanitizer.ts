import { type PlanningRunRecord } from "../store/types";

function sanitizeNamedRef<T extends { name: string; path?: string; sizeBytes?: number }>(ref: T): Omit<T, "path"> {
  const { path: _path, ...rest } = ref;
  return rest;
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
