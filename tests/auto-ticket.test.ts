import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listFeedback } from "../src/lib/feedback/feedbackStore";
import { buildFingerprint, createOrAppendOpsTicket, resolveOpsTicketsOnSuccess } from "../src/lib/ops/autoTicket";

const TEST_STORE_PATH = path.join(process.cwd(), "tmp", "user_feedback.auto-ticket.test.json");

let previousStorePath: string | undefined;

function cleanup() {
  if (fs.existsSync(TEST_STORE_PATH)) {
    fs.unlinkSync(TEST_STORE_PATH);
  }
}

describe("ops auto ticket", () => {
  beforeEach(() => {
    previousStorePath = process.env.FEEDBACK_STORE_PATH;
    process.env.FEEDBACK_STORE_PATH = TEST_STORE_PATH;
    cleanup();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-27T10:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
    if (typeof previousStorePath === "string") process.env.FEEDBACK_STORE_PATH = previousStorePath;
    else delete process.env.FEEDBACK_STORE_PATH;
  });

  it("creates ticket on first failure", () => {
    const result = createOrAppendOpsTicket({
      type: "FIX",
      id: "SEED_DEBUG",
      cause: "DB_NOT_READY",
      summary: "DB 준비 상태가 불완전합니다.",
      stderrTail: "no such table: users",
      stdoutTail: "pnpm seed:debug",
      suggestedFixIds: ["PRISMA_PUSH", "SEED_DEBUG"],
      tookMs: 412,
    });

    expect(result.action).toBe("created");
    expect(result.fingerprint).toBe(buildFingerprint("FIX", "SEED_DEBUG", "DB_NOT_READY"));

    const rows = listFeedback(10);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.category).toBe("bug");
    expect(rows[0]?.status).toBe("OPEN");
    expect(rows[0]?.priority).toBe("P0");
    expect(rows[0]?.message).toBe("[OPS][SEED_DEBUG] 실패: DB_NOT_READY");
    expect(rows[0]?.tags).toEqual(expect.arrayContaining(["ops", "auto", "fix", "SEED_DEBUG", "DB_NOT_READY"]));
    expect(rows[0]?.fingerprint).toBe(buildFingerprint("FIX", "SEED_DEBUG", "DB_NOT_READY"));
    expect(rows[0]?.note).toContain("no such table: users");
    expect(rows[0]?.note).toContain("pnpm seed:debug");
  });

  it("appends note instead of creating duplicate ticket within 1 hour", () => {
    const first = createOrAppendOpsTicket({
      type: "CHAIN",
      id: "FULL_REPAIR",
      cause: "UPSTREAM_UNAVAILABLE",
      summary: "외부 소스 응답 불안정",
      stderrTail: "fetch failed",
      stdoutTail: "step1 ok",
      suggestedFixIds: ["DATA_DOCTOR"],
      tookMs: 1500,
    });
    vi.setSystemTime(new Date("2026-02-27T10:30:00.000Z"));
    const second = createOrAppendOpsTicket({
      type: "CHAIN",
      id: "FULL_REPAIR",
      cause: "UPSTREAM_UNAVAILABLE",
      summary: "같은 원인 재발",
      stderrTail: "service unavailable",
      stdoutTail: "step1 ok",
      suggestedFixIds: ["DAILY_REFRESH"],
      tookMs: 1700,
    });

    expect(first.action).toBe("created");
    expect(second.action).toBe("appended");
    expect(second.ticketId).toBe(first.ticketId);

    const rows = listFeedback(10);
    expect(rows).toHaveLength(1);
    const note = rows[0]?.note ?? "";
    expect(note).toContain("외부 소스 응답 불안정");
    expect(note).toContain("같은 원인 재발");
    expect(note).toContain("service unavailable");
    expect(note.match(/\[AUTO\]\[OPS\]/g)?.length).toBe(2);
  });

  it("creates a new ticket after 1 hour window", () => {
    const first = createOrAppendOpsTicket({
      type: "FIX",
      id: "DART_WATCH",
      cause: "MISSING_OPENDART_KEY",
      summary: "OPENDART_API_KEY 누락",
      stderrTail: "missing key",
      stdoutTail: "",
      suggestedFixIds: ["DART_WATCH"],
      tookMs: 300,
    });
    vi.setSystemTime(new Date("2026-02-27T11:01:00.000Z"));
    const second = createOrAppendOpsTicket({
      type: "FIX",
      id: "DART_WATCH",
      cause: "MISSING_OPENDART_KEY",
      summary: "1시간 초과 후 동일 실패",
      stderrTail: "still missing key",
      stdoutTail: "",
      suggestedFixIds: ["DART_WATCH"],
      tookMs: 280,
    });

    expect(first.action).toBe("created");
    expect(second.action).toBe("created");
    expect(second.ticketId).not.toBe(first.ticketId);

    const rows = listFeedback(10);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.fingerprint).toBe(rows[1]?.fingerprint);
  });

  it("marks active ops tickets as DONE on successful recovery", () => {
    createOrAppendOpsTicket({
      type: "CHAIN",
      id: "FULL_REPAIR",
      cause: "UNKNOWN",
      summary: "복구 체인 실패",
      stderrTail: "db failed",
      stdoutTail: "",
      suggestedFixIds: ["SEED_DEBUG"],
      tookMs: 1000,
    });

    const resolved = resolveOpsTicketsOnSuccess({
      type: "CHAIN",
      id: "FULL_REPAIR",
      summary: "복구 체인 실행 성공",
      historyId: "hist-001",
      tookMs: 2200,
    });
    expect(resolved.ok).toBe(true);
    expect(resolved.resolvedCount).toBe(1);

    const rows = listFeedback(10);
    expect(rows[0]?.status).toBe("DONE");
    expect(rows[0]?.note).toContain("[AUTO][OPS][RECOVERED]");
    expect(rows[0]?.note).toContain("historyId: hist-001");
  });
});
