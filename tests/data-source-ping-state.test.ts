import { describe, expect, it } from "vitest";
import {
  buildDataSourcePingDetails,
  createDataSourcePingSnapshot,
  formatDataSourcePingSummary,
  getDataSourcePingStorageKey,
  parseDataSourcePingSnapshot,
  stringifyDataSourcePingSnapshot,
  type DataSourcePingSnapshot,
} from "../src/lib/dataSources/pingState";

describe("data source ping state helpers", () => {
  it("formats exchange and count summaries into readable text", () => {
    expect(formatDataSourcePingSummary({ asOf: "2026-03-11", rateCount: 10 })).toContain("기준일 2026-03-11");
    expect(formatDataSourcePingSummary({ count: 24, normalizedCount: 20 })).toContain("24건");
  });

  it("builds structured detail chips from ping summaries", () => {
    expect(buildDataSourcePingDetails({ asOf: "2026-03-11", count: 24, matchedRows: 12 })).toEqual([
      { label: "기준일", value: "2026-03-11" },
      { label: "건수", value: "24건" },
      { label: "매칭", value: "12행" },
    ]);
  });

  it("creates rich ping snapshots with summary text and details", () => {
    const snapshot = createDataSourcePingSnapshot({
      source: "exim_exchange",
      success: true,
      fetchedAt: "2026-03-11T10:00:00.000Z",
      summary: { asOf: "2026-03-11", rateCount: 10 },
    });

    expect(snapshot).toEqual({
      source: "exim_exchange",
      tone: "ok",
      text: "연결 OK · 기준일 2026-03-11 · 10개 통화",
      fetchedAt: "2026-03-11T10:00:00.000Z",
      summaryText: "기준일 2026-03-11 · 10개 통화",
      details: [
        { label: "기준일", value: "2026-03-11" },
        { label: "통화 수", value: "10개" },
      ],
      statusLabel: "정상",
    });
  });

  it("round-trips stored ping snapshots", () => {
    const snapshot: DataSourcePingSnapshot = {
      source: "exim_exchange",
      tone: "ok",
      text: "연결 OK · 기준일 2026-03-11 · 10개 통화",
      fetchedAt: "2026-03-11T10:00:00.000Z",
      summaryText: "기준일 2026-03-11 · 10개 통화",
      details: [{ label: "통화 수", value: "10개" }],
      statusLabel: "정상",
    };
    expect(parseDataSourcePingSnapshot(stringifyDataSourcePingSnapshot(snapshot))).toEqual(snapshot);
  });

  it("keeps legacy snapshots readable when summary fields are missing", () => {
    expect(parseDataSourcePingSnapshot(JSON.stringify({
      source: "exim_exchange",
      tone: "error",
      text: "연결 주의 · 기준일 2026-03-11 · 10개 통화",
      fetchedAt: "2026-03-11T10:00:00.000Z",
    }))).toEqual({
      source: "exim_exchange",
      tone: "error",
      text: "연결 주의 · 기준일 2026-03-11 · 10개 통화",
      fetchedAt: "2026-03-11T10:00:00.000Z",
      summaryText: "기준일 2026-03-11 · 10개 통화",
      statusLabel: "주의",
    });
  });

  it("rejects malformed stored ping snapshots", () => {
    expect(parseDataSourcePingSnapshot("{")).toBeNull();
    expect(parseDataSourcePingSnapshot(JSON.stringify({ source: "exim_exchange", tone: "ok", text: "", fetchedAt: "bad" }))).toBeNull();
  });

  it("builds stable storage keys per source id", () => {
    expect(getDataSourcePingStorageKey("EXIM_EXCHANGE")).toBe("data-source-ping:v1:EXIM_EXCHANGE");
  });
});