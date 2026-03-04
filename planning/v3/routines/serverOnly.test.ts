import { describe, expect, it } from "vitest";
import { readDailyRoutineChecklist } from "./store";

describe("planning v3 routines store server-only", () => {
  it("throws when window is defined", () => {
    const previousWindow = (globalThis as Record<string, unknown>).window;
    (globalThis as Record<string, unknown>).window = {};
    try {
      expect(() => readDailyRoutineChecklist("2026-03-05")).toThrow(/server-only/i);
    } finally {
      if (previousWindow === undefined) {
        delete (globalThis as Record<string, unknown>).window;
      } else {
        (globalThis as Record<string, unknown>).window = previousWindow;
      }
    }
  });
});
