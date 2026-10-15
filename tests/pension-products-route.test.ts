import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "../src/app/api/products/pension/route";
import {
  loadPensionGuaranteedSnapshot,
  loadPensionProductsSnapshot,
} from "../src/lib/products/pensionSnapshots";

const tempDirs: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function tempDataRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pension-route-"));
  tempDirs.push(root);
  fs.mkdirSync(path.join(root, ".data"));
  return root;
}

function readRepoSnapshot(name: string) {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), ".data", name), "utf8")) as Record<string, unknown> & { items: unknown[] };
}

type PensionRouteJson = {
  ok?: boolean;
  data?: Record<string, unknown> & {
    total: number;
    items: Array<{ avgFeeRate?: number | null; selling?: boolean; fees?: unknown }>;
  };
  error?: { code?: string };
  meta?: Record<string, unknown>;
};

async function getJson(query: string) {
  const response = await GET(new Request(`http://localhost/api/products/pension${query}`));
  return { status: response.status, payload: await response.json() as PensionRouteJson };
}

describe("pension snapshot reader", () => {
  it("reads the committed snapshots with their disclosure periods", () => {
    const products = loadPensionProductsSnapshot();
    const guaranteed = loadPensionGuaranteedSnapshot();
    expect(products.status).toBe("ok");
    expect(guaranteed.status).toBe("ok");
    if (products.status !== "ok" || guaranteed.status !== "ok") return;
    expect(products.snapshot.items.length).toBe(products.snapshot.rowCount);
    expect(guaranteed.snapshot.items.every((item) => item.reportMonth === guaranteed.snapshot.asOf.reportMonth)).toBe(true);
  });

  it("separates a missing snapshot from a damaged one and notices a replaced file", () => {
    const dataDir = path.join(tempDataRoot(), ".data");
    expect(loadPensionProductsSnapshot({ dataDir })).toEqual({ status: "missing" });

    const filePath = path.join(dataDir, "fss_pension_products_snapshot.json");
    fs.writeFileSync(filePath, "{not json");
    expect(loadPensionProductsSnapshot({ dataDir })).toEqual({ status: "invalid", reason: "snapshot is not valid JSON" });

    const snapshot = readRepoSnapshot("fss_pension_products_snapshot.json");
    fs.writeFileSync(filePath, JSON.stringify({ ...snapshot, rowCount: snapshot.items.length + 1 }));
    expect(loadPensionProductsSnapshot({ dataDir })).toEqual({ status: "invalid", reason: "rowCount does not match items" });

    const [first, ...rest] = snapshot.items as Array<Record<string, unknown>>;
    fs.writeFileSync(filePath, JSON.stringify({ ...snapshot, items: [{ ...first, sells: "maybe" }, ...rest] }));
    expect(loadPensionProductsSnapshot({ dataDir })).toMatchObject({ status: "invalid", reason: "items[0].sells must be Y or N" });

    fs.writeFileSync(filePath, JSON.stringify(snapshot));
    expect(loadPensionProductsSnapshot({ dataDir }).status).toBe("ok");
  });

  it("rejects a guaranteed row from a different report month", () => {
    const dataDir = path.join(tempDataRoot(), ".data");
    const snapshot = readRepoSnapshot("fss_pension_guaranteed_snapshot.json");
    const [first, ...rest] = snapshot.items as Array<Record<string, unknown>>;
    fs.writeFileSync(
      path.join(dataDir, "fss_pension_guaranteed_snapshot.json"),
      JSON.stringify({ ...snapshot, items: [{ ...first, reportMonth: "2026-08" }, ...rest] }),
    );
    expect(loadPensionGuaranteedSnapshot({ dataDir })).toMatchObject({ status: "invalid", reason: "items[0].reportMonth differs from asOf" });
  });
});

describe("GET /api/products/pension", () => {
  it("serves the guaranteed insurance list by default with source, period and freshness", async () => {
    const { status, payload } = await getJson("");
    expect(status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data).toMatchObject({
      dataset: "guaranteed",
      source: { attribution: "통합연금포털(금융감독원) 콘텐츠", pageUrl: expect.stringContaining("svingsInsrnc") },
      asOf: { reportMonth: expect.stringMatching(/^\d{4}-\d{2}$/) },
      freshness: { periodUnit: "month", maxAgeDays: 7 },
    });
    expect(payload.data?.total).toBe(payload.data?.items.length);
    expect(payload.data?.items[0]).toHaveProperty("fees");
  });

  it("serves a page of products sorted by the lowest fee among products on sale", async () => {
    const { status, payload } = await getJson("?dataset=products");
    expect(status).toBe(200);
    expect(payload.data).toMatchObject({ dataset: "products", page: 1, pageSize: 20, freshness: { periodUnit: "quarter" } });
    const fees = (payload.data?.items ?? []).map((row) => row.avgFeeRate ?? null);
    const published = fees.filter((fee): fee is number => fee !== null);
    expect(published).toEqual([...published].sort((a, b) => a - b));
    expect(payload.data?.items.every((row) => row.selling)).toBe(true);
  });

  it("rejects invalid query values with 400", async () => {
    const { status, payload } = await getJson("?dataset=products&sort=rateDesc");
    expect(status).toBe(400);
    expect(payload.error?.code).toBe("INPUT");
  });

  it("reports a missing snapshot as 409 and a damaged one as 500, never as an empty list", async () => {
    const root = tempDataRoot();
    vi.spyOn(process, "cwd").mockReturnValue(root);
    const missing = await getJson("?dataset=products");
    expect(missing.status).toBe(409);
    expect(missing.payload).toMatchObject({ ok: false, error: { code: "SNAPSHOT_MISSING" } });

    fs.writeFileSync(path.join(root, ".data", "fss_pension_guaranteed_snapshot.json"), JSON.stringify({ schemaVersion: 2 }));
    const damaged = await getJson("?dataset=guaranteed");
    expect(damaged.status).toBe(500);
    expect(damaged.payload).toMatchObject({ ok: false, error: { code: "SNAPSHOT_INVALID" } });
    expect(damaged.payload.data).toBeUndefined();
  });
});
