import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  getSnapshotOrNull: vi.fn(),
}));

vi.mock("../src/lib/publicApis/benefitsSnapshot", () => ({
  getSnapshotOrNull: mocked.getSnapshotOrNull,
}));

import { GET as benefitsSearchGET } from "../src/app/api/public/benefits/search/route";

async function callBenefitsSearch(query = "") {
  const response = await benefitsSearchGET(new Request(`http://localhost/api/public/benefits/search${query}`));
  return {
    status: response.status,
    json: await response.json() as {
      ok?: boolean;
      error?: { code?: string; message?: string };
      meta?: {
        traceId?: string;
        diagnosticId?: string;
        debug?: { opsDiagnostic?: { diagnosticId?: string; hint?: string } };
      };
    },
  };
}

describe("public API diagnostics", () => {
  beforeEach(() => {
    mocked.getSnapshotOrNull.mockReset();
    mocked.getSnapshotOrNull.mockReturnValue(null);
  });

  it("keeps benefits snapshot recovery commands out of public messages", async () => {
    const { status, json } = await callBenefitsSearch("?scan=all");

    expect(status).toBe(409);
    expect(json).toMatchObject({
      ok: false,
      error: {
        code: "SNAPSHOT_MISSING",
        message: "공공 혜택 기준 데이터가 아직 준비되지 않았습니다. 잠시 후 다시 조회하거나 검색 범위를 줄여 주세요.",
      },
      meta: {
        diagnosticId: "benefits.snapshot.missing",
      },
    });
    expect(typeof json.meta?.traceId).toBe("string");
    expect(json.error?.message ?? "").not.toMatch(/\/api\/dev|pnpm|snapshot.*refresh|Run /i);
    expect(JSON.stringify(json.meta?.debug ?? {})).not.toMatch(/\/api\/dev|pnpm|snapshot.*refresh|Run /i);
  });

  it("shows benefits ops hints only on explicit debug diagnostics", async () => {
    const { status, json } = await callBenefitsSearch("?scan=all&debug=1");

    expect(status).toBe(409);
    expect(json.error?.message ?? "").not.toMatch(/\/api\/dev|pnpm|snapshot.*refresh|Run /i);
    expect(json.meta?.debug?.opsDiagnostic?.diagnosticId).toBe("benefits.snapshot.missing");
    expect(json.meta?.debug?.opsDiagnostic?.hint ?? "").toContain("/api/dev/benefits/snapshot/refresh");
  });
});
