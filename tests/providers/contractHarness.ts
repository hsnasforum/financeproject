import { expect } from "vitest";
import { type ProviderResponse } from "../../src/lib/providers/types";

function isIsoDate(value: string): boolean {
  const ms = Date.parse(value);
  return Number.isFinite(ms);
}

export function expectProviderContract<TData>(
  response: ProviderResponse<TData>,
  options: {
    sourceId: string;
    debug?: boolean;
  },
): void {
  expect(typeof response.ok).toBe("boolean");

  if (response.ok) {
    expect(response.data).toBeDefined();
    expect(response.meta).toBeDefined();
    expect(response.meta.sourceId).toBe(options.sourceId);
    expect(typeof response.meta.generatedAt).toBe("string");
    expect(isIsoDate(response.meta.generatedAt)).toBe(true);
    expect(response.meta.fallback).toBeDefined();
    expect(response.meta.fallback?.mode).toMatch(/^(LIVE|CACHE|REPLAY)$/);
    if (options.debug) {
      expect(response.meta.debug?.timings).toBeDefined();
    }
    return;
  }

  expect(response.error).toBeDefined();
  expect(typeof response.error.code).toBe("string");
  expect(response.error.code.length).toBeGreaterThan(0);
  expect(typeof response.error.message).toBe("string");
  expect(response.error.message.length).toBeGreaterThan(0);

  if (response.error.issues !== undefined) {
    expect(Array.isArray(response.error.issues)).toBe(true);
  }
  if (response.meta) {
    expect(response.meta.sourceId).toBe(options.sourceId);
    expect(typeof response.meta.generatedAt).toBe("string");
    expect(isIsoDate(response.meta.generatedAt)).toBe(true);
    expect(response.meta.fallback).toBeDefined();
  }
}
