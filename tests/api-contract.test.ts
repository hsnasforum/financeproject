import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  ApiBaseResponseSchema,
  ApiErrorResponseSchema,
  createApiDataResponseSchema,
  parseApiDataResponse,
} from "../src/lib/http/apiContract";

describe("api contract schemas", () => {
  it("accepts canonical ok/error response shapes", () => {
    const okPayload = { ok: true, data: { id: "run-1" } };
    const errorPayload = {
      ok: false,
      error: {
        code: "INPUT",
        message: "잘못된 요청입니다.",
      },
    };

    expect(ApiBaseResponseSchema.safeParse(okPayload).success).toBe(true);
    expect(ApiBaseResponseSchema.safeParse(errorPayload).success).toBe(true);
  });

  it("rejects breaking error shape missing code", () => {
    const brokenPayload = {
      ok: false,
      error: {
        message: "missing code",
      },
    };

    expect(ApiErrorResponseSchema.safeParse(brokenPayload).success).toBe(false);
  });

  it("validates typed data payloads", () => {
    const schema = createApiDataResponseSchema(z.object({
      id: z.string().min(1),
      count: z.number().int().nonnegative(),
    }));

    expect(schema.safeParse({ ok: true, data: { id: "x", count: 3 } }).success).toBe(true);
    expect(schema.safeParse({ ok: true, data: { id: "", count: 3 } }).success).toBe(false);
    expect(schema.safeParse({ ok: true }).success).toBe(false);
  });

  it("parseApiDataResponse catches response shape drift", () => {
    const parsed = parseApiDataResponse(
      { ok: true, payload: { id: "missing-data-key" } },
      z.object({ id: z.string() }),
    );
    expect(parsed.success).toBe(false);
  });
});

