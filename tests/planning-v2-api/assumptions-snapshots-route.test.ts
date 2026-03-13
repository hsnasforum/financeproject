import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  listAssumptionsHistoryMock,
  loadAssumptionsSnapshotByIdMock,
  loadLatestAssumptionsSnapshotMock,
  findAssumptionsSnapshotIdMock,
} = vi.hoisted(() => ({
  listAssumptionsHistoryMock: vi.fn(),
  loadAssumptionsSnapshotByIdMock: vi.fn(),
  loadLatestAssumptionsSnapshotMock: vi.fn(),
  findAssumptionsSnapshotIdMock: vi.fn(),
}));

vi.mock("../../src/lib/planning/assumptions/storage", () => ({
  listAssumptionsHistory: (...args: unknown[]) => listAssumptionsHistoryMock(...args),
  loadAssumptionsSnapshotById: (...args: unknown[]) => loadAssumptionsSnapshotByIdMock(...args),
  loadLatestAssumptionsSnapshot: (...args: unknown[]) => loadLatestAssumptionsSnapshotMock(...args),
  findAssumptionsSnapshotId: (...args: unknown[]) => findAssumptionsSnapshotIdMock(...args),
}));

import { GET } from "../../src/app/api/planning/v2/assumptions/snapshots/route";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;

function request(urlPath: string): Request {
  return new Request(`http://localhost:3000${urlPath}`, {
    method: "GET",
    headers: {
      host: "localhost:3000",
      origin: "http://localhost:3000",
      referer: "http://localhost:3000/planning",
    },
  });
}

describe("GET /api/planning/v2/assumptions/snapshots", () => {
  beforeEach(() => {
    env.NODE_ENV = "test";
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T00:00:00.000Z"));
    listAssumptionsHistoryMock.mockReset();
    loadAssumptionsSnapshotByIdMock.mockReset();
    loadLatestAssumptionsSnapshotMock.mockReset();
    findAssumptionsSnapshotIdMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    if (typeof originalNodeEnv === "string") env.NODE_ENV = originalNodeEnv;
    else delete env.NODE_ENV;
  });

  it("returns latest + history snapshot list with staleDays", async () => {
    listAssumptionsHistoryMock.mockResolvedValue([
      { id: "snap-old", fetchedAt: "2026-02-10T09:00:00.000Z", asOf: "2026-02-10" },
      { id: "snap-new", fetchedAt: "2026-03-14T09:00:00.000Z", asOf: "2026-03-14" },
    ]);
    loadAssumptionsSnapshotByIdMock.mockImplementation(async (id: string) => {
      if (id === "snap-new") {
        return {
          version: 1,
          asOf: "2026-03-14",
          fetchedAt: "2026-03-14T09:00:00.000Z",
          korea: {
            policyRatePct: 2.75,
            cpiYoYPct: 2.1,
          },
          sources: [{ name: "src", url: "https://example.com", fetchedAt: "2026-03-14T09:00:00.000Z" }],
          warnings: [],
        };
      }
      if (id === "snap-old") {
        return {
          version: 1,
          asOf: "2026-02-10",
          fetchedAt: "2026-02-10T09:00:00.000Z",
          korea: {
            newDepositAvgPct: 3.05,
          },
          sources: [{ name: "src", url: "https://example.com", fetchedAt: "2026-02-10T09:00:00.000Z" }],
          warnings: ["STALE_RATE"],
        };
      }
      return null;
    });
    loadLatestAssumptionsSnapshotMock.mockResolvedValue({
      version: 1,
      asOf: "2026-03-14",
      fetchedAt: "2026-03-14T09:00:00.000Z",
      korea: {
        policyRatePct: 2.75,
        cpiYoYPct: 2.1,
      },
      sources: [
        { name: "s1", url: "https://example.com/1", fetchedAt: "2026-03-14T09:00:00.000Z" },
        { name: "s2", url: "https://example.com/2", fetchedAt: "2026-03-14T09:00:00.000Z" },
      ],
      warnings: ["WARN_A"],
    });
    findAssumptionsSnapshotIdMock.mockResolvedValue("snap-new");

    const response = await GET(request("/api/planning/v2/assumptions/snapshots?limit=30"));
    const payload = await response.json() as {
      ok?: boolean;
      data?: {
        latest?: {
          id?: string;
          staleDays?: number;
          warningsCount?: number;
          sourcesCount?: number;
          korea?: {
            policyRatePct?: number;
            cpiYoYPct?: number;
          };
        };
        items?: Array<{
          id?: string;
          staleDays?: number;
          warningsCount?: number;
          korea?: {
            newDepositAvgPct?: number;
          };
        }>;
      };
    };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data?.latest?.id).toBe("snap-new");
    expect(payload.data?.latest?.warningsCount).toBe(1);
    expect(payload.data?.latest?.sourcesCount).toBe(2);
    expect(payload.data?.latest?.korea?.policyRatePct).toBe(2.75);
    expect(payload.data?.latest?.korea?.cpiYoYPct).toBe(2.1);
    expect(typeof payload.data?.latest?.staleDays).toBe("number");
    expect((payload.data?.latest?.staleDays ?? -1) >= 0).toBe(true);
    expect(payload.data?.items?.map((item) => item.id)).toEqual(["snap-new", "snap-old"]);
    expect((payload.data?.items ?? []).every((item) => typeof item.staleDays === "number" && item.staleDays >= 0)).toBe(true);
    expect(payload.data?.items?.[0]?.warningsCount).toBe(0);
    expect(payload.data?.items?.[1]?.warningsCount).toBe(1);
    expect(payload.data?.items?.[1]?.korea?.newDepositAvgPct).toBe(3.05);
  });
});
