import { describe, expect, it } from "vitest";
import { isOpsTicket, parseOpsAction } from "../src/lib/ops/opsTicketParser";

describe("ops ticket parser", () => {
  it("detects ops ticket by tags/message with P0 priority", () => {
    expect(isOpsTicket({
      priority: "P0",
      tags: ["ops", "auto", "fix", "SEED_DEBUG"],
      message: "[OPS][SEED_DEBUG] 실패: DB_NOT_READY",
    })).toBe(true);

    expect(isOpsTicket({
      priority: "P1",
      tags: ["ops"],
      message: "[OPS][SEED_DEBUG] 실패: DB_NOT_READY",
    })).toBe(false);
  });

  it("parses action from tags first", () => {
    const parsed = parseOpsAction({
      priority: "P0",
      tags: ["ops", "chainId:FULL_REPAIR", "fixId:SEED_DEBUG"],
      message: "[OPS][SEED_DEBUG] 실패: DB_NOT_READY",
      note: "",
    });

    expect(parsed).toEqual({
      kind: "CHAIN",
      id: "FULL_REPAIR",
      cause: "DB_NOT_READY",
    });
  });

  it("parses action from message pattern when tags are insufficient", () => {
    const parsed = parseOpsAction({
      priority: "P0",
      tags: ["ops", "auto", "fix"],
      message: "[OPS][SEED_DEBUG] 실패: DB_NOT_READY",
      note: "",
    });

    expect(parsed).toEqual({
      kind: "FIX",
      id: "SEED_DEBUG",
      cause: "DB_NOT_READY",
    });
  });

  it("extracts suggestedFixIds from note when present", () => {
    const parsed = parseOpsAction({
      priority: "P0",
      tags: ["ops", "FULL_REPAIR"],
      message: "[OPS][FULL_REPAIR] 실패: UPSTREAM_UNAVAILABLE",
      note: [
        "[AUTO][OPS] 2026-02-27T11:00:00.000Z",
        "- type: CHAIN",
        "- suggestedFixIds: DATA_DOCTOR, DAILY_REFRESH, NOT_ALLOWED",
      ].join("\n"),
    });

    expect(parsed).toEqual({
      kind: "CHAIN",
      id: "FULL_REPAIR",
      cause: "UPSTREAM_UNAVAILABLE",
      suggestedFixIds: ["DATA_DOCTOR", "DAILY_REFRESH"],
    });
  });
});
