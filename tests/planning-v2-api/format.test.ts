import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiResponseSchema, parsePlanningV2Response } from "../../src/lib/planning/api/contracts";

const {
  loadLatestAssumptionsSnapshotMock,
  loadAssumptionsSnapshotByIdMock,
  findAssumptionsSnapshotIdMock,
} = vi.hoisted(() => ({
  loadLatestAssumptionsSnapshotMock: vi.fn(),
  loadAssumptionsSnapshotByIdMock: vi.fn(),
  findAssumptionsSnapshotIdMock: vi.fn(),
}));

vi.mock("../../src/lib/planning/assumptions/storage", () => ({
  loadLatestAssumptionsSnapshot: (...args: unknown[]) => loadLatestAssumptionsSnapshotMock(...args),
  loadAssumptionsSnapshotById: (...args: unknown[]) => loadAssumptionsSnapshotByIdMock(...args),
  findAssumptionsSnapshotId: (...args: unknown[]) => findAssumptionsSnapshotIdMock(...args),
}));

import { POST } from "../../src/app/api/planning/v2/simulate/route";

function request(body: unknown): Request {
  return new Request("http://localhost:3000/api/planning/v2/simulate", {
    method: "POST",
    headers: {
      host: "localhost:3000",
      origin: "http://localhost:3000",
      referer: "http://localhost:3000/planning",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function baseProfile() {
  return {
    monthlyIncomeNet: 4_000_000,
    monthlyEssentialExpenses: 1_500_000,
    monthlyDiscretionaryExpenses: 600_000,
    liquidAssets: 800_000,
    investmentAssets: 2_000_000,
    debts: [],
    goals: [],
  };
}

describe("planning v2 api response format", () => {
  beforeEach(() => {
    loadLatestAssumptionsSnapshotMock.mockReset();
    loadAssumptionsSnapshotByIdMock.mockReset();
    findAssumptionsSnapshotIdMock.mockReset();
    findAssumptionsSnapshotIdMock.mockResolvedValue(undefined);
    loadLatestAssumptionsSnapshotMock.mockResolvedValue(null);
  });

  it("returns standard error body shape", async () => {
    const response = await POST(request({ profile: {}, horizonMonths: 12 }));
    const payload = await response.json();
    const schema = ApiResponseSchema.safeParse(payload);

    expect(response.status).toBe(400);
    expect(schema.success).toBe(true);
    expect(payload.ok).toBe(false);
    if (payload.ok === false) {
      expect(typeof payload.error?.code).toBe("string");
      expect(typeof payload.error?.message).toBe("string");
    }
  });

  it("returns standard success body shape with meta.snapshot", async () => {
    const response = await POST(request({
      profile: baseProfile(),
      horizonMonths: 12,
    }));
    const payload = await response.json();
    const schema = ApiResponseSchema.safeParse(payload);

    expect(response.status).toBe(200);
    expect(schema.success).toBe(true);
    expect(payload.ok).toBe(true);
    expect(typeof payload.meta?.generatedAt).toBe("string");
    expect(payload.meta?.snapshot?.missing).toBe(true);
    expect(payload.data).toBeTruthy();
  });

  it("returns FORMAT typed error when payload shape is malformed", () => {
    const malformedPayload = { ok: true, meta: { generatedAt: "2026-01-01T00:00:00.000Z" } };
    const parsed = parsePlanningV2Response(malformedPayload);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error.code).toBe("FORMAT");
    }
  });
});
