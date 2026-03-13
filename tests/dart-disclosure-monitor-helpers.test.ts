import { describe, expect, it } from "vitest";
import {
  buildDisclosureMonitorPriorityList,
  buildDisclosureMonitorSummary,
  describeDisclosureMonitorFilters,
  getDisclosureMonitorPresetRange,
  sortDisclosureMonitorWatchlist,
  validateDisclosureMonitorSettings,
} from "../src/lib/dart/disclosureMonitor";

describe("dart disclosure monitor helpers", () => {
  it("validates date format and range", () => {
    expect(validateDisclosureMonitorSettings({
      from: "2026-03-20",
      to: "2026-03-11",
      finalOnly: true,
      pageCount: 20,
    })).toBe("시작일은 종료일보다 늦을 수 없습니다.");

    expect(validateDisclosureMonitorSettings({
      from: "2026-13-01",
      to: undefined,
      finalOnly: true,
      pageCount: 20,
    })).toBe("시작일은 YYYY-MM-DD 형식으로 입력해 주세요.");
  });

  it("builds readable filter chips", () => {
    expect(describeDisclosureMonitorFilters({
      from: "2026-03-01",
      to: "2026-03-11",
      type: "A",
      finalOnly: false,
      pageCount: 50,
    })).toEqual([
      "정정/예비 포함",
      "최근 50건",
      "기간 2026-03-01 ~ 2026-03-11",
      "유형 A",
    ]);
  });

  it("summarizes watchlist counts", () => {
    expect(buildDisclosureMonitorSummary(
      [
        { corpCode: "001" },
        { corpCode: "002" },
        { corpCode: "003" },
      ],
      {
        "001": { items: [{}], newItems: [{}, {}], lastCheckedAt: "2026-03-11T00:00:00.000Z" },
        "002": { items: [{}], newItems: [], lastCheckedAt: "2026-03-10T00:00:00.000Z" },
        "003": { items: [], newItems: [], lastCheckedAt: null },
      },
    )).toEqual({
      watchlistCount: 3,
      checkedCorpCount: 2,
      neverCheckedCorpCount: 1,
      pendingCorpCount: 1,
      totalNewItems: 2,
    });
  });

  it("returns inclusive preset ranges", () => {
    const base = new Date("2026-03-11T12:00:00Z");
    expect(getDisclosureMonitorPresetRange("today", base)).toEqual({
      from: "2026-03-11",
      to: "2026-03-11",
    });
    expect(getDisclosureMonitorPresetRange("7d", base)).toEqual({
      from: "2026-03-05",
      to: "2026-03-11",
    });
    expect(getDisclosureMonitorPresetRange("30d", base)).toEqual({
      from: "2026-02-10",
      to: "2026-03-11",
    });
    expect(getDisclosureMonitorPresetRange("all", base)).toEqual({
      from: undefined,
      to: undefined,
    });
  });

  it("sorts pending and unchecked companies ahead of already checked companies", () => {
    expect(sortDisclosureMonitorWatchlist(
      [
        { corpCode: "003", corpName: "감마" },
        { corpCode: "001", corpName: "알파" },
        { corpCode: "004", corpName: "델타" },
        { corpCode: "002", corpName: "베타" },
      ],
      {
        "001": { items: [{}], newItems: [{}, {}], lastCheckedAt: "2026-03-11T00:00:00.000Z" },
        "002": { items: [], newItems: [], lastCheckedAt: null },
        "003": { items: [{}], newItems: [], lastCheckedAt: "2026-03-10T00:00:00.000Z" },
        "004": { items: [{}], newItems: [{}], lastCheckedAt: "2026-03-09T00:00:00.000Z" },
      },
    ).map((item) => item.corpCode)).toEqual([
      "001",
      "004",
      "002",
      "003",
    ]);
  });

  it("builds a top priority list for summary quick actions", () => {
    expect(buildDisclosureMonitorPriorityList(
      [
        { corpCode: "003", corpName: "감마" },
        { corpCode: "001", corpName: "알파" },
        { corpCode: "004", corpName: "델타" },
        { corpCode: "002", corpName: "베타" },
      ],
      {
        "001": {
          items: [{ reportName: "알파 최근 공시", receiptDate: "2026-03-11" }],
          newItems: [
            { reportName: "알파 신규 공시", receiptDate: "2026-03-11" },
            { reportName: "알파 보조 공시", receiptDate: "2026-03-10" },
          ],
          lastCheckedAt: "2026-03-11T00:00:00.000Z",
        },
        "002": { items: [], newItems: [], lastCheckedAt: null },
        "003": { items: [{ reportName: "감마 최근 공시", receiptDate: "2026-03-10" }], newItems: [], lastCheckedAt: "2026-03-10T00:00:00.000Z" },
        "004": {
          items: [{ reportName: "델타 최근 공시", receiptDate: "2026-03-09" }],
          newItems: [{ reportName: "델타 신규 공시", receiptDate: "2026-03-09" }],
          lastCheckedAt: "2026-03-09T00:00:00.000Z",
        },
      },
      3,
    )).toEqual([
      {
        corpCode: "001",
        corpName: "알파",
        reason: "pending",
        newCount: 2,
        lastCheckedAt: "2026-03-11T00:00:00.000Z",
        previewText: "알파 신규 공시 · 2026-03-11",
      },
      {
        corpCode: "004",
        corpName: "델타",
        reason: "pending",
        newCount: 1,
        lastCheckedAt: "2026-03-09T00:00:00.000Z",
        previewText: "델타 신규 공시 · 2026-03-09",
      },
      {
        corpCode: "002",
        corpName: "베타",
        reason: "unchecked",
        newCount: 0,
        lastCheckedAt: null,
        previewText: "최근 공시를 아직 불러오지 않았습니다.",
      },
    ]);
  });
});
