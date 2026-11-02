import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  FSS_PENSION_GUARANTEED_SNAPSHOT,
  FSS_PENSION_PRODUCTS_SNAPSHOT,
  collectFssPensionSnapshots,
  fssPensionSnapshotsAreFresh,
  writeFssPensionSnapshots,
} from "../scripts/fss_pension_sync.mjs";

const API_KEY = "K".repeat(32);
// 2026-10-15 03:00 KST: Q3 2026 is the latest completed quarter and is not published yet.
const NOW = new Date("2026-10-14T18:00:00Z");
const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function fixture(name: string) {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), "tests", "fixtures", "fss_pension", name), "utf8"));
}

type Responder = (endpoint: string, params: URLSearchParams) => unknown;

function requestUrl(input: RequestInfo | URL): URL {
  return new URL(input instanceof Request ? input.url : String(input));
}

function fakeFetch(respond: Responder) {
  const calls: URL[] = [];
  const fetchImpl = async (input: RequestInfo | URL) => {
    const url = requestUrl(input);
    calls.push(url);
    const endpoint = url.pathname.split("/").pop()!.replace(/\.json$/, "");
    return new Response(JSON.stringify(respond(endpoint, url.searchParams)), {
      status: 200,
      headers: { "content-type": "application/json;charset=UTF-8" },
    });
  };
  return { fetchImpl, calls };
}

const publishedFrom = (year: number, quarter: number): Responder => (endpoint, params) => {
  if (endpoint === "psGuaranteedProdList") return fixture(`psGuaranteedProdList_area${params.get("areaCode")}.json`);
  const requested = Number(params.get("year")) * 10 + Number(params.get("quarter"));
  if (requested > year * 10 + quarter) return fixture("psProdList2_2026q3_not_published.json");
  return fixture(`psProdList2_2026q2_area${params.get("areaCode")}.json`);
};

describe("FSS pension sync", () => {
  it("selects the newest published quarter and records how it was chosen", async () => {
    const { fetchImpl, calls } = fakeFetch(publishedFrom(2026, 2));

    const snapshots = await collectFssPensionSnapshots({ apiKey: API_KEY, fetchImpl, now: NOW });

    expect(snapshots.products.asOf).toEqual({ year: 2026, quarter: 2, label: "2026년 2분기" });
    expect(snapshots.products.selection).toEqual({
      attempts: [
        { year: 2026, quarter: 3, status: "not_published", areaCode: 1 },
        { year: 2026, quarter: 2, status: "selected" },
      ],
      quartersBehind: 1,
    });
    expect(snapshots.products.areas.map((area: { code: number }) => area.code)).toEqual([1, 3, 4, 5]);
    expect(snapshots.products.areas.find((area: { code: number }) => area.code === 3)).toMatchObject({
      sourceRows: 4,
      rowCount: 2,
      excludedRowsWithoutProductInfo: 2,
    });
    expect(snapshots.products.rowCount).toBe(snapshots.products.items.length);
    expect(snapshots.products.source).toMatchObject({ attribution: "통합연금포털(금융감독원) 콘텐츠", endpoint: "psProdList2" });
    expect(snapshots.products.generatedAt).toBe(NOW.toISOString());

    expect(snapshots.guaranteed.asOf).toEqual({ reportMonth: "2026-09", label: "2026년 9월" });
    expect(snapshots.guaranteed.areas).toEqual([
      expect.objectContaining({ code: 4, sourceRows: 2, rowCount: 2, exactDuplicateRowsRemoved: 0 }),
      expect.objectContaining({ code: 5, sourceRows: 3, rowCount: 2, exactDuplicateRowsRemoved: 1 }),
    ]);

    // One unpublished probe, four areas for Q2, two guaranteed areas.
    expect(calls).toHaveLength(7);
    expect(calls.every((url) => url.searchParams.get("key") === API_KEY)).toBe(true);
    expect(JSON.stringify(snapshots)).not.toContain(API_KEY);
  });

  it("stops when no recent quarter is published", async () => {
    const { fetchImpl } = fakeFetch(publishedFrom(2025, 4));
    await expect(collectFssPensionSnapshots({ apiKey: API_KEY, fetchImpl, now: NOW }))
      .rejects.toMatchObject({ code: "NO_DATA", message: expect.stringContaining("2026년 1분기") });
  });

  it("does not fall back to an older quarter on errors other than unpublished data", async () => {
    const { fetchImpl, calls } = fakeFetch((endpoint) => (
      endpoint === "psProdList2" ? { code: "101", message: "하루 최대 사용 제한을 초과하였습니다." } : {}
    ));
    await expect(collectFssPensionSnapshots({ apiKey: API_KEY, fetchImpl, now: NOW }))
      .rejects.toMatchObject({ code: "RATE_LIMIT" });
    expect(calls).toHaveLength(1);
  });

  it("requires the 32-character key before calling the API", async () => {
    const { fetchImpl, calls } = fakeFetch(publishedFrom(2026, 2));
    await expect(collectFssPensionSnapshots({ apiKey: "", fetchImpl, now: NOW }))
      .rejects.toMatchObject({ code: "CONFIG_MISSING" });
    expect(calls).toHaveLength(0);
  });

  it("never echoes the key when a request fails", async () => {
    const fetchImpl = async (input: RequestInfo | URL): Promise<Response> => {
      throw new TypeError(`fetch failed for ${requestUrl(input).href}`);
    };
    const error = await collectFssPensionSnapshots({ apiKey: API_KEY, fetchImpl, now: NOW }).catch((caught) => caught);
    expect(error).toMatchObject({ code: "UPSTREAM" });
    expect(String(error.message)).not.toContain(API_KEY);
  });

  it("writes both snapshots together and judges freshness by their generatedAt", async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "fss-pension-sync-"));
    tempDirs.push(dataDir);
    const { fetchImpl } = fakeFetch(publishedFrom(2026, 2));
    const snapshots = await collectFssPensionSnapshots({ apiKey: API_KEY, fetchImpl, now: NOW });

    expect(fssPensionSnapshotsAreFresh(dataDir, NOW)).toBe(false);
    writeFssPensionSnapshots(dataDir, snapshots);

    expect(fs.readdirSync(dataDir).sort()).toEqual([FSS_PENSION_GUARANTEED_SNAPSHOT, FSS_PENSION_PRODUCTS_SNAPSHOT].sort());
    const written = JSON.parse(fs.readFileSync(path.join(dataDir, FSS_PENSION_PRODUCTS_SNAPSHOT), "utf8"));
    expect(written.asOf.label).toBe("2026년 2분기");
    expect(fssPensionSnapshotsAreFresh(dataDir, new Date(NOW.getTime() + 2 * 24 * 60 * 60 * 1000))).toBe(true);
    expect(fssPensionSnapshotsAreFresh(dataDir, new Date(NOW.getTime() + 4 * 24 * 60 * 60 * 1000))).toBe(false);
  });
});
