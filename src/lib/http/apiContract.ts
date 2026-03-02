import { z } from "zod";

export const ApiMetaSchema = z.record(z.string(), z.unknown());

export const ApiErrorSchema = z.object({
  code: z.string().trim().min(1),
  message: z.string().trim().min(1),
  fixHref: z.string().trim().min(1).optional(),
  issues: z.array(z.string()).optional(),
  debug: z.record(z.string(), z.unknown()).optional(),
  details: z.unknown().optional(),
});

export const ApiErrorResponseSchema = z.object({
  ok: z.literal(false),
  error: ApiErrorSchema,
  meta: ApiMetaSchema.optional(),
}).passthrough();

export const ApiLegacyErrorResponseSchema = z.object({
  ok: z.literal(false),
  code: z.string().trim().min(1),
  message: z.string().trim().min(1),
  meta: ApiMetaSchema.optional(),
}).passthrough();

export const ApiOkBaseResponseSchema = z.object({
  ok: z.literal(true),
}).passthrough();

export const ApiBaseResponseSchema = z.union([
  ApiOkBaseResponseSchema,
  ApiErrorResponseSchema,
  ApiLegacyErrorResponseSchema,
]);

export type ApiErrorShape = z.infer<typeof ApiErrorSchema>;
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;
export type ApiLegacyErrorResponse = z.infer<typeof ApiLegacyErrorResponseSchema>;
export type ApiOkBaseResponse = z.infer<typeof ApiOkBaseResponseSchema>;
export type ApiBaseResponse = z.infer<typeof ApiBaseResponseSchema>;

export function createApiDataResponseSchema<TData extends z.ZodTypeAny>(dataSchema: TData) {
  return z.object({
    ok: z.literal(true),
    data: dataSchema,
    meta: ApiMetaSchema.optional(),
  }).passthrough();
}

export function isApiBaseResponse(payload: unknown): payload is ApiBaseResponse {
  return ApiBaseResponseSchema.safeParse(payload).success;
}

export function parseApiDataResponse<TData extends z.ZodTypeAny>(payload: unknown, dataSchema: TData) {
  return createApiDataResponseSchema(dataSchema).safeParse(payload);
}

