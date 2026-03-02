import { z } from "zod";

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

export type PlanningApiTypedResponse<TData> =
  | { ok: true; data: TData; meta?: PlanningApiMeta }
  | { ok: false; error: PlanningApiError; meta?: Record<string, unknown> };

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
