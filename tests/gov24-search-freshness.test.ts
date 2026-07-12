import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSnapshotOrNull: vi.fn(),
  isGov24SyncInFlight: vi.fn(),
  getBenefitItem: vi.fn(),
  fetchOfficialGov24Detail: vi.fn(),
}));

vi.mock("@/lib/publicApis/benefitsSnapshot", () => ({
  getSnapshotOrNull: mocks.getSnapshotOrNull,
}));

vi.mock("@/lib/publicApis/gov24SyncState", () => ({
  isGov24SyncInFlight: mocks.isGov24SyncInFlight,
}));

vi.mock("@/lib/publicApis/providers/benefits", () => ({
  getBenefitItem: mocks.getBenefitItem,
}));

vi.mock("@/lib/gov24/officialClient", () => ({
  fetchOfficialGov24Detail: mocks.fetchOfficialGov24Detail,
}));

import { GET } from "../src/app/api/gov24/search/route";
import { POST as simpleFindPOST } from "../src/app/api/gov24/simple-find/route";
import { GET as detailGET } from "../src/app/api/gov24/detail/route";
import { BENEFITS_FLOW_COPY } from "../src/lib/publicApis/benefitsFlowContract";

describe("Gov24 search snapshot freshness", () => {
  it("returns stale cached data while exposing a distinct needs-sync status", async () => {
    mocks.isGov24SyncInFlight.mockReturnValue(false);
    mocks.getSnapshotOrNull.mockReturnValue({
      fromCache: "disk",
      isStale: true,
      snapshot: {
        meta: {
          generatedAt: "2026-07-01T00:00:00.000Z",
          totalItemsInSnapshot: 1,
          uniqueCount: 1,
          upstreamTotalCount: 1,
          completionRate: 1,
        },
        items: [{
          id: "benefit-1",
          title: "테스트 혜택",
          summary: "저장된 혜택 설명",
          eligibilityHints: ["확인 필요"],
          region: { scope: "NATIONWIDE", tags: ["전국"] },
          source: "gov24",
          fetchedAt: "2026-07-01T00:00:00.000Z",
        }],
      },
    });

    const response = await GET(new Request("http://localhost:3000/api/gov24/search?q=&cursor=0&pageSize=10"));
    const payload = await response.json() as {
      ok?: boolean;
      data?: { items?: Array<{ id?: string }> };
      meta?: {
        fallback?: { reason?: string; generatedAt?: string };
        sync?: { state?: string };
        message?: string;
      };
    };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data?.items?.[0]?.id).toBe("benefit-1");
    expect(payload.meta?.fallback?.reason).toBe("snapshot_stale");
    expect(payload.meta?.fallback?.generatedAt).toBe("2026-07-01T00:00:00.000Z");
    expect(payload.meta?.sync?.state).toBe("needs_sync");
    expect(payload.meta?.message).toBe(BENEFITS_FLOW_COPY.snapshotStale);
  });

  it("marks stale snapshot results on the user-facing simple-find response", async () => {
    mocks.getSnapshotOrNull.mockReturnValue({
      fromCache: "memory",
      isStale: true,
      snapshot: {
        meta: {
          generatedAt: "2026-07-01T00:00:00.000Z",
          totalItemsInSnapshot: 0,
          uniqueCount: 0,
          upstreamTotalCount: 0,
          completionRate: 1,
        },
        items: [],
      },
    });

    const response = await simpleFindPOST(new Request("http://localhost:3000/api/gov24/simple-find", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        host: "localhost:3000",
        origin: "http://localhost:3000",
      },
      body: JSON.stringify({
        targetType: "individual",
        region: { sido: "서울특별시", sigungu: "종로구" },
        birth: { yyyymmdd: "19900101", gender: "F" },
        incomeBracket: "51_75",
        personalTraits: [],
        householdTraits: [],
        q: "",
      }),
    }));
    const payload = await response.json() as {
      meta?: { fallback?: { reason?: string }; message?: string };
    };

    expect(response.status).toBe(200);
    expect(payload.meta?.fallback?.reason).toBe("snapshot_stale");
    expect(payload.meta?.message).toBe(BENEFITS_FLOW_COPY.snapshotStale);
  });

  it("marks stale cached fields when Gov24 detail live lookup falls back", async () => {
    mocks.fetchOfficialGov24Detail.mockResolvedValue(null);
    mocks.getBenefitItem.mockResolvedValue({
      ok: false,
      error: { code: "UPSTREAM", message: "unavailable" },
    });
    mocks.getSnapshotOrNull.mockReturnValue({
      fromCache: "disk",
      isStale: true,
      snapshot: {
        meta: {
          generatedAt: "2026-07-01T00:00:00.000Z",
          totalItemsInSnapshot: 1,
          uniqueCount: 1,
          upstreamTotalCount: 1,
          completionRate: 1,
        },
        items: [{
          id: "benefit-1",
          title: "테스트 혜택",
          summary: "저장된 혜택 설명",
          eligibilityHints: [],
          region: { scope: "NATIONWIDE", tags: ["전국"] },
          source: "gov24",
          fetchedAt: "2026-07-01T00:00:00.000Z",
        }],
      },
    });

    const response = await detailGET(new Request(
      "http://localhost:3000/api/gov24/detail?svcId=benefit-1",
    ));
    const payload = await response.json() as {
      meta?: { fallback?: { reason?: string }; message?: string };
    };

    expect(response.status).toBe(200);
    expect(payload.meta?.fallback?.reason).toBe("snapshot_stale");
    expect(payload.meta?.message).toBe(BENEFITS_FLOW_COPY.snapshotStale);
  });
});
