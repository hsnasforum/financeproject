import { z } from "zod";
import type { EngineEnvelope } from "../engine";

export const ApiErrorSchema = z.object({
  code: z.string(),
  message: z.string().optional(),
  issues: z.array(z.string()).optional(),
});

export const ApiMetaSchema = z.object({
  generatedAt: z.string().optional(),
  snapshot: z.object({
    missing: z.boolean().optional(),
  }).passthrough().optional(),
}).passthrough();

export const ApiOkSchema = z.object({
  ok: z.literal(true),
  meta: ApiMetaSchema.optional(),
  data: z.unknown().refine((value) => value !== undefined, {
    message: "data is required",
  }),
});

export const ApiErrSchema = z.object({
  ok: z.literal(false),
  error: ApiErrorSchema,
  meta: z.record(z.unknown()).optional(),
});

export const ApiResponseSchema = z.union([ApiOkSchema, ApiErrSchema]);

export type PlanningApiError = z.infer<typeof ApiErrorSchema>;
export type PlanningApiMeta = z.infer<typeof ApiMetaSchema>;
export type PlanningApiOk = z.infer<typeof ApiOkSchema>;
export type PlanningApiErr = z.infer<typeof ApiErrSchema>;
export type PlanningApiResponse = z.infer<typeof ApiResponseSchema>;
export type PlanningEngineEnvelope = EngineEnvelope;

export type PlanningApiEngineData<TData extends Record<string, unknown> = Record<string, unknown>> =
  TData & { engine: PlanningEngineEnvelope };

export interface PlanningApiEngineEnvelope {
  engineSchemaVersion: number;
  engine: PlanningEngineEnvelope;
}

export type PlanningApiTypedResponse<TData> =
  | { ok: true; data: TData; meta?: PlanningApiMeta }
  | { ok: false; error: PlanningApiError; meta?: Record<string, unknown> };

export type NormalizedPlanningResponse<TData extends Record<string, unknown>> = {
  data: TData & PlanningApiEngineEnvelope;
  engine: PlanningEngineEnvelope;
  engineSchemaVersion: number;
};

export function parsePlanningV2Response<TData = unknown>(payload: unknown): PlanningApiTypedResponse<TData> {
  const parsed = ApiResponseSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "FORMAT",
        message: "planning v2 API 응답 형식이 올바르지 않습니다.",
      },
    };
  }
  if (parsed.data.ok) {
    return {
      ok: true,
      data: parsed.data.data as TData,
      ...(parsed.data.meta ? { meta: parsed.data.meta } : {}),
    };
  }
  return parsed.data;
}

export function getEngineEnvelope<TData extends Partial<PlanningApiEngineEnvelope>>(response: TData): PlanningEngineEnvelope {
  if (response.engine) return response.engine;
  throw new Error("Missing engine envelope in planning API response");
}

export function normalizePlanningResponse<TData extends Record<string, unknown> & Partial<PlanningApiEngineEnvelope>>(
  response: TData,
): NormalizedPlanningResponse<TData> {
  const engine = getEngineEnvelope(response);
  const engineSchemaVersion = typeof response.engineSchemaVersion === "number" && Number.isFinite(response.engineSchemaVersion)
    ? Math.max(1, Math.trunc(response.engineSchemaVersion))
    : 1;
  const data = {
    ...response,
    engine,
    engineSchemaVersion,
  } as TData & PlanningApiEngineEnvelope;

  return {
    data,
    engine,
    engineSchemaVersion,
  };
}
