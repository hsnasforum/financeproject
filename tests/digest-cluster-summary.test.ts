import { describe, expect, it } from "vitest";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - ESM .mjs import
import { buildCompanyFiveLineSummary, buildDigestMarkdown } from "../scripts/dart_disclosure_watch.mjs";
import { clusterByCorp, type DisclosureClusterItem } from "../src/lib/dart/disclosureCluster";

describe("digest cluster summary", () => {
  it("builds 5-line summary from clusters", () => {
    const clusters = [
      { representativeLevel: "high", representativeScore: 92, clusterScore: 96, representativeTitle: "유상증자 결정", count: 3, endDate: "20260215" },
      { representativeLevel: "mid", representativeScore: 71, clusterScore: 78, representativeTitle: "단일판매 공급계약 체결", count: 2, endDate: "20260214" },
      { representativeLevel: "low", representativeScore: 45, clusterScore: 52, representativeTitle: "주주총회 소집결의", count: 1, endDate: "20260213" },
      { representativeLevel: "low", representativeScore: 40, clusterScore: 49, representativeTitle: "기타 경영사항", count: 1, endDate: "20260212" },
      { representativeLevel: "low", representativeScore: 30, clusterScore: 41, representativeTitle: "해명공시", count: 1, endDate: "20260211" },
      { representativeLevel: "low", representativeScore: 20, clusterScore: 35, representativeTitle: "조회공시 답변", count: 1, endDate: "20260210" },
    ];

    const lines = buildCompanyFiveLineSummary({ clusters }, 5);
    expect(lines).toHaveLength(5);
    expect(lines[0]).toContain("유상증자 결정 (3건)");
  });

  it("prefers normal representative title over correction/submission flags in same cluster", () => {
    const rows: DisclosureClusterItem[] = [
      {
        corpCode: "00126380",
        corpName: "삼성전자",
        receiptNo: "20260002",
        receiptDate: "20260202",
        reportName: "[기재정정](공시서류제출) 단일판매 공급계약 체결",
        normalizedTitle: "[기재정정](공시서류제출) 단일판매 공급계약 체결",
        tokens: ["단일판매", "공급계약", "체결"],
        classification: { level: "high", score: 98, categoryId: "contract", categoryLabel: "공급계약/소송" },
      },
      {
        corpCode: "00126380",
        corpName: "삼성전자",
        receiptNo: "20260001",
        receiptDate: "20260201",
        reportName: "단일판매 공급계약 체결",
        normalizedTitle: "단일판매 공급계약 체결",
        tokens: ["단일판매", "공급계약", "체결"],
        classification: { level: "high", score: 90, categoryId: "contract", categoryLabel: "공급계약/소송" },
      },
    ];

    const clusters = clusterByCorp(rows, {
      windowDays: 10,
      minTokenOverlap: 0.2,
      maxClusterSize: 8,
    });

    expect(clusters).toHaveLength(1);
    expect(clusters[0]?.representativeTitle).toBe("단일판매 공급계약 체결");
    expect(clusters[0]?.representative.reportName).toBe("단일판매 공급계약 체결");
  });

  it("orders summary by clusterScore and reflects count bonus in cluster score", () => {
    const rows: DisclosureClusterItem[] = [
      {
        corpCode: "00126380",
        corpName: "삼성전자",
        receiptNo: "A1",
        receiptDate: "20260101",
        reportName: "A",
        normalizedTitle: "A",
        tokens: ["a"],
        classification: { level: "high", score: 85, categoryId: "contract", categoryLabel: "공급계약/소송" },
      },
      {
        corpCode: "00126380",
        corpName: "삼성전자",
        receiptNo: "B4",
        receiptDate: "20260101",
        reportName: "B",
        normalizedTitle: "B",
        tokens: ["b"],
        classification: { level: "mid", score: 80, categoryId: "contract", categoryLabel: "공급계약/소송" },
      },
      {
        corpCode: "00126380",
        corpName: "삼성전자",
        receiptNo: "B3",
        receiptDate: "20260101",
        reportName: "B",
        normalizedTitle: "B",
        tokens: ["b"],
        classification: { level: "mid", score: 80, categoryId: "contract", categoryLabel: "공급계약/소송" },
      },
      {
        corpCode: "00126380",
        corpName: "삼성전자",
        receiptNo: "B2",
        receiptDate: "20260101",
        reportName: "B",
        normalizedTitle: "B",
        tokens: ["b"],
        classification: { level: "mid", score: 80, categoryId: "contract", categoryLabel: "공급계약/소송" },
      },
      {
        corpCode: "00126380",
        corpName: "삼성전자",
        receiptNo: "B1",
        receiptDate: "20260101",
        reportName: "B",
        normalizedTitle: "B",
        tokens: ["b"],
        classification: { level: "mid", score: 80, categoryId: "contract", categoryLabel: "공급계약/소송" },
      },
    ];

    const clusters = clusterByCorp(rows, {
      windowDays: 10,
      minTokenOverlap: 0.2,
      maxClusterSize: 8,
    });
    expect(clusters).toHaveLength(2);
    expect(clusters[0]?.count).toBe(4);
    expect(clusters[0]?.clusterScore).toBeGreaterThan(clusters[1]?.clusterScore ?? 0);
    expect(clusters[0]?.clusterScore).toBeGreaterThan(clusters[0]?.representativeScore ?? 0);

    const lines = buildCompanyFiveLineSummary({ clusters: [clusters[1], clusters[0]] }, 2);
    expect(lines[0]).toContain("B (4건)");
  });

  it("renders cluster markdown with representative title and details", () => {
    const digest = {
      generatedAt: "2026-02-25T10:00:00.000Z",
      watchlistPath: "config/dart-watchlist.json",
      rulesPath: "config/dart-disclosure-rules.json",
      from: "20260101",
      to: "20260225",
      finalOnly: true,
      type: "",
      summary: {
        companies: 1,
        totalItems: 4,
        totalNew: 2,
        errors: 0,
        levelCounts: { high: 1, mid: 0, low: 0 },
        skippedReason: "",
      },
      topHighlights: [
        {
          corpCode: "00126380",
          corpName: "삼성전자",
          representativeTitle: "유상증자 결정",
          representativeLevel: "high",
          representativeScore: 92,
          categoryLabel: "자본/증자/감자",
          count: 2,
        },
      ],
      companies: [
        {
          corpCode: "00126380",
          corpName: "삼성전자",
          checkedAt: "2026-02-25T10:00:00.000Z",
          totalCount: 4,
          newCount: 2,
          summaryLines: ["[HIGH 92] 유상증자 결정 (2건)"],
          clusters: [
            {
              representativeTitle: "유상증자 결정",
              representativeLevel: "high",
              representativeScore: 92,
              categoryLabel: "자본/증자/감자",
              count: 2,
              items: [
                { receiptDate: "20260202", reportName: "유상증자 결정", receiptNo: "20260001" },
                { receiptDate: "20260201", reportName: "정정 유상증자 결정", receiptNo: "20260000" },
              ],
            },
          ],
          error: "",
        },
      ],
    };

    const markdown = buildDigestMarkdown(digest);
    expect(markdown).toContain("## 핵심 Top");
    expect(markdown).toContain("유상증자 결정 (2건)");
    expect(markdown).toContain("<details>");
    expect(markdown).toContain("<summary>상세 항목 2건</summary>");
  });
});
