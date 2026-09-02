import { describe, expect, it } from "vitest";
import {
  GOV24_STATUS_CHECK_COPY,
  GOV24_STATUS_MAX_AUTO_POLLS,
  GOV24_STATUS_POLL_DELAYS_MS,
  GOV24_STATUS_RETRY_DELAYS_MS,
  parseGov24StatusPayload,
} from "../src/lib/gov24/statusLifecycle";

const readyPayload = {
  ok: true,
  meta: {
    snapshot: {
      totalItems: 10,
      completionRate: 1,
      generatedAt: "2026-09-01T00:00:00.000Z",
      uniqueCount: 10,
      isStale: false,
    },
    sync: { state: "ready" },
    fallback: { mode: "CACHE", reason: "snapshot_read" },
  },
};

describe("Gov24 status lifecycle contract", () => {
  it("accepts ready, syncing, and actual needs_sync payloads", () => {
    expect(parseGov24StatusPayload(readyPayload)).toEqual(expect.objectContaining({
      valid: true,
      meta: expect.objectContaining({ sync: { state: "ready" } }),
    }));
    expect(parseGov24StatusPayload({
      ok: true,
      meta: { snapshot: null, sync: { state: "syncing" } },
    })).toEqual({
      valid: true,
      meta: { snapshot: null, sync: { state: "syncing" } },
    });
    expect(parseGov24StatusPayload({
      ok: true,
      meta: {
        snapshot: null,
        sync: { state: "needs_sync" },
        fallback: { mode: "CACHE", reason: "snapshot_missing" },
      },
    })).toEqual(expect.objectContaining({
      valid: true,
      meta: expect.objectContaining({ sync: { state: "needs_sync" } }),
    }));
  });

  it("rejects ok=false, missing meta, and missing or unknown sync state", () => {
    expect(parseGov24StatusPayload({ ok: false })).toEqual({
      valid: false,
      reason: "PAYLOAD_NOT_OK",
    });
    expect(parseGov24StatusPayload({ ok: true })).toEqual({
      valid: false,
      reason: "META_MISSING",
    });
    expect(parseGov24StatusPayload({ ok: true, meta: { snapshot: null } })).toEqual({
      valid: false,
      reason: "SYNC_STATE_INVALID",
    });
    expect(parseGov24StatusPayload({
      ok: true,
      meta: { snapshot: null, sync: { state: "unknown" } },
    })).toEqual({
      valid: false,
      reason: "SYNC_STATE_INVALID",
    });
  });

  it("rejects malformed snapshots and ready responses without snapshot evidence", () => {
    expect(parseGov24StatusPayload({
      ok: true,
      meta: {
        snapshot: { completionRate: 1.2 },
        sync: { state: "syncing" },
      },
    })).toEqual({ valid: false, reason: "SNAPSHOT_INVALID" });
    expect(parseGov24StatusPayload({
      ok: true,
      meta: {
        snapshot: { generatedAt: "not-a-date" },
        sync: { state: "ready" },
      },
    })).toEqual({ valid: false, reason: "SNAPSHOT_INVALID" });
    expect(parseGov24StatusPayload({
      ok: true,
      meta: { snapshot: null, sync: { state: "ready" } },
    })).toEqual({ valid: false, reason: "SNAPSHOT_INVALID" });
  });

  it("keeps retry timing bounded and user copy separate from sync state", () => {
    expect(GOV24_STATUS_RETRY_DELAYS_MS).toEqual([1_000, 2_000, 4_000, 8_000]);
    expect(GOV24_STATUS_POLL_DELAYS_MS).toEqual([10_000, 20_000, 30_000, 60_000]);
    expect(GOV24_STATUS_MAX_AUTO_POLLS).toBe(12);
    expect(GOV24_STATUS_CHECK_COPY.retrying(2_000)).toContain("2초 후");
    expect(GOV24_STATUS_CHECK_COPY.paused).toContain("자동 상태 확인을 마쳤습니다");
    expect(GOV24_STATUS_CHECK_COPY.failed).toContain("상태 확인 실패");
  });
});
