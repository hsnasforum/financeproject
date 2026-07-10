import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchLiveFinlife: vi.fn(),
  saveFinlifeSnapshot: vi.fn(),
}));

vi.mock("../src/lib/finlife/fetchLive", () => ({
  fetchLiveFinlife: mocks.fetchLiveFinlife,
}));

vi.mock("../src/lib/finlife/snapshot", () => ({
  saveFinlifeSnapshot: mocks.saveFinlifeSnapshot,
}));

import {
  collectFinlifeSnapshot,
  runFinlifeSnapshotSync,
} from "../src/lib/finlife/syncRunner";

const ENV_KEYS = [
  "FINLIFE_MODE",
  "FINLIFE_FAIL_OPEN_TO_MOCK",
  "FINLIFE_TOPFIN_GRP_LIST",
] as const;
const originalEnv = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
) as Record<typeof ENV_KEYS[number], string | undefined>;

function restoreEnv() {
  for (const key of ENV_KEYS) {
    const value = originalEnv[key];
    if (typeof value === "string") process.env[key] = value;
    else delete process.env[key];
  }
}

describe("FINLIFE snapshot sync upstream failure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    restoreEnv();
    process.env.FINLIFE_MODE = "live";
    process.env.FINLIFE_FAIL_OPEN_TO_MOCK = "0";
    process.env.FINLIFE_TOPFIN_GRP_LIST = "020000";
    mocks.fetchLiveFinlife.mockRejectedValue(new Error("HTTP 401 Unauthorized"));
  });

  afterEach(() => {
    restoreEnv();
  });

  it("keeps the previous snapshot when the live upstream fails", async () => {
    await expect(runFinlifeSnapshotSync("deposit")).resolves.toEqual({
      ok: false,
      kind: "deposit",
      error: {
        code: "UPSTREAM_FETCH_FAILED",
        message: "FINLIFE upstream fetch failed",
        upstreamStatus: 401,
      },
    });

    expect(mocks.fetchLiveFinlife).toHaveBeenCalledTimes(1);
    expect(mocks.saveFinlifeSnapshot).not.toHaveBeenCalled();
  });

  it("marks fail-open mock data without presenting it as live", async () => {
    process.env.FINLIFE_FAIL_OPEN_TO_MOCK = "1";

    await expect(runFinlifeSnapshotSync("saving")).resolves.toMatchObject({
      ok: true,
      kind: "saving",
      meta: {
        source: "mock",
        fallbackUsed: true,
        lastUpstreamStatus: 401,
        totalProducts: 3,
      },
    });

    expect(mocks.saveFinlifeSnapshot).toHaveBeenCalledWith(
      "saving",
      expect.objectContaining({
        meta: expect.objectContaining({
          source: "mock",
          fallbackUsed: true,
          lastUpstreamStatus: 401,
        }),
        items: expect.arrayContaining([
          expect.objectContaining({
            fin_prdt_cd: "S001",
            fin_prdt_nm: "한빛 자유적금",
            kor_co_nm: "한빛은행",
          }),
        ]),
      }),
    );
  });

  it("collects without writing until a persistence boundary accepts the result", async () => {
    process.env.FINLIFE_FAIL_OPEN_TO_MOCK = "1";

    await expect(collectFinlifeSnapshot("deposit")).resolves.toMatchObject({
      ok: true,
      snapshot: {
        meta: {
          source: "mock",
          fallbackUsed: true,
        },
      },
    });

    expect(mocks.saveFinlifeSnapshot).not.toHaveBeenCalled();
  });
});
