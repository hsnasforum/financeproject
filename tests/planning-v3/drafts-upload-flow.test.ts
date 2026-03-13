import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  fetchCsvDraftPreview,
  fetchDraftList,
  saveCsvDraftPreview,
  type DraftUploadListItem,
} from "../../src/app/planning/v3/drafts/_components/draftsUploadFlow";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function readFixture(name: string): unknown {
  const fixturePath = path.join(
    process.cwd(),
    "tests",
    "fixtures",
    "planning-v3",
    "drafts-upload-flow",
    name,
  );
  return JSON.parse(fs.readFileSync(fixturePath, "utf8")) as unknown;
}

describe("planning v3 drafts upload flow", () => {
  it("supports upload preview -> save -> list refresh using mocked fetch", async () => {
    const rowsAfterSave: DraftUploadListItem[] = [
      {
        id: "d_saved_1",
        createdAt: "2026-03-03T00:00:00.000Z",
        source: { kind: "csv", rows: 2, months: 1 },
        summary: {
          medianIncomeKrw: 3_000_000,
          medianExpenseKrw: 1_000_000,
          avgNetKrw: 2_000_000,
        },
      },
    ];

    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({
        ok: true,
        cashflow: [
          { ym: "2026-01", incomeKrw: 3_000_000, expenseKrw: -1_000_000, netKrw: 2_000_000, txCount: 2 },
        ],
        draftPatch: {
          monthlyIncomeNet: 3_000_000,
          monthlyEssentialExpenses: 1_000_000,
          monthlyDiscretionaryExpenses: 300_000,
        },
        meta: { rows: 2, months: 1 },
        draftSummary: { rows: 2, columns: 3 },
      }))
      .mockResolvedValueOnce(jsonResponse({
        ok: true,
        id: "d_saved_1",
        createdAt: "2026-03-03T00:00:00.000Z",
      }, 201))
      .mockResolvedValueOnce(jsonResponse({
        ok: true,
        drafts: rowsAfterSave,
      }));

    const preview = await fetchCsvDraftPreview("date,amount,description\n2026-01-01,1000,salary", fetchMock, "csrf");
    const saved = await saveCsvDraftPreview(preview, { filename: "sample.csv" }, fetchMock, "csrf");
    const list = await fetchDraftList(fetchMock, "csrf");

    expect(saved).toEqual({ id: "d_saved_1", createdAt: "2026-03-03T00:00:00.000Z" });
    expect(list).toEqual(rowsAfterSave);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const firstUrl = String(fetchMock.mock.calls[0]?.[0] ?? "");
    const firstInit = fetchMock.mock.calls[0]?.[1];
    const secondUrl = String(fetchMock.mock.calls[1]?.[0] ?? "");
    const thirdUrl = String(fetchMock.mock.calls[2]?.[0] ?? "");
    expect(firstUrl).toContain("/api/planning/v3/import/csv");
    expect(firstUrl).toContain("csrf=csrf");
    expect(firstUrl).not.toContain("persist=");
    expect(String(firstInit?.headers && (firstInit.headers as Record<string, string>)["content-type"])).toBe("application/json");
    expect(String(firstInit?.headers && (firstInit.headers as Record<string, string>)["x-csrf-token"])).toBe("csrf");
    expect(String(firstInit?.body ?? "")).toContain("\"csvText\"");
    expect(secondUrl).toContain("/api/planning/v3/drafts");
    expect(thirdUrl).toContain("/api/planning/v3/drafts");
  });

  it("prefers payload.data.monthlyCashflow/meta/draftPatch", async () => {
    const fixture = readFixture("preview-data-shape.json");
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(fixture));

    const preview = await fetchCsvDraftPreview(
      "date,amount,description\n2026-02-01,3000000,salary",
      fetchMock,
      "csrf",
    );

    expect(preview.cashflow).toEqual([
      { ym: "2026-02", incomeKrw: 3_000_000, expenseKrw: -1_000_000, netKrw: 2_000_000, txCount: 2 },
    ]);
    expect(preview.draftPatch).toEqual({
      monthlyIncomeNet: 3_000_000,
      monthlyEssentialExpenses: 1_000_000,
      monthlyDiscretionaryExpenses: 300_000,
    });
    expect(preview.meta).toEqual({ rows: 2, months: 1 });
    expect(preview.draftSummary).toEqual({ rows: 2, columns: 5 });

    const firstUrl = String(fetchMock.mock.calls[0]?.[0] ?? "");
    const firstInit = fetchMock.mock.calls[0]?.[1];
    expect(firstUrl).toContain("/api/planning/v3/import/csv");
    expect(firstUrl).toContain("csrf=csrf");
    expect(firstUrl).not.toContain("persist=");
    expect(String(firstInit?.headers && (firstInit.headers as Record<string, string>)["content-type"])).toBe("application/json");
    expect(String(firstInit?.headers && (firstInit.headers as Record<string, string>)["x-csrf-token"])).toBe("csrf");
    expect(String(firstInit?.body ?? "")).toContain("\"csvText\"");
  });

  it("supports legacy top-level preview response shape from fixture", async () => {
    const fixture = readFixture("preview-legacy-shape.json");
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(fixture));

    const preview = await fetchCsvDraftPreview(
      "date,amount,description\n2026-01-01,1000,salary",
      fetchMock,
      "csrf",
    );

    expect(preview.cashflow).toEqual([
      { ym: "2026-01", incomeKrw: 3_000_000, expenseKrw: -1_000_000, netKrw: 2_000_000, txCount: 2 },
    ]);
    expect(preview.draftPatch).toEqual({
      monthlyIncomeNet: 3_000_000,
      monthlyEssentialExpenses: 1_000_000,
      monthlyDiscretionaryExpenses: 300_000,
    });
    expect(preview.meta).toEqual({ rows: 2, months: 1 });
    expect(preview.draftSummary).toEqual({ rows: 2, columns: 3 });
  });
});
