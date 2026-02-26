import { describe, expect, it } from "vitest";
import { diffDigest, hasNewHighAlerts } from "../src/lib/dart/disclosureDigestDiff";

function cluster(input: Record<string, unknown>) {
  return {
    categoryId: "contract",
    categoryLabel: "공급계약/소송",
    representativeLevel: "mid",
    representativeScore: 80,
    clusterScore: 82,
    representativeTitle: "단일판매 공급계약 체결",
    count: 2,
    endDate: "20260210",
    representative: {
      receiptNo: "2026000010",
      reportName: "단일판매 공급계약 체결",
      tokens: ["단일판매", "공급계약", "체결"],
      classification: { score: 80, level: "mid" },
    },
    items: [
      {
        receiptNo: "2026000010",
        reportName: "단일판매 공급계약 체결",
        tokens: ["단일판매", "공급계약", "체결"],
        classification: { score: 80 },
      },
      {
        receiptNo: "2026000009",
        reportName: "단일판매 공급계약 체결(첨부정정)",
        tokens: ["단일판매", "공급계약", "체결"],
        classification: { score: 79 },
      },
    ],
    ...input,
  };
}

describe("disclosure digest diff", () => {
  it("detects new and updated clusters and builds high/mid highlights", () => {
    const prev = {
      companies: [
        {
          corpCode: "00126380",
          corpName: "삼성전자",
          clusters: [
            cluster({}),
          ],
        },
      ],
    };

    const curr = {
      companies: [
        {
          corpCode: "00126380",
          corpName: "삼성전자",
          clusters: [
            cluster({
              representativeScore: 86,
              clusterScore: 91,
              count: 3,
              representative: {
                receiptNo: "2026000011",
                reportName: "단일판매 공급계약 체결",
                tokens: ["단일판매", "공급계약", "체결"],
                classification: { score: 86, level: "mid" },
              },
              items: [
                {
                  receiptNo: "2026000011",
                  reportName: "단일판매 공급계약 체결",
                  tokens: ["단일판매", "공급계약", "체결"],
                  classification: { score: 86 },
                },
                {
                  receiptNo: "2026000010",
                  reportName: "단일판매 공급계약 체결",
                  tokens: ["단일판매", "공급계약", "체결"],
                  classification: { score: 80 },
                },
                {
                  receiptNo: "2026000009",
                  reportName: "단일판매 공급계약 체결(첨부정정)",
                  tokens: ["단일판매", "공급계약", "체결"],
                  classification: { score: 79 },
                },
              ],
            }),
            cluster({
              categoryId: "capital",
              categoryLabel: "자본/증자/감자",
              representativeLevel: "high",
              representativeScore: 95,
              clusterScore: 98,
              representativeTitle: "유상증자 결정",
              count: 1,
              representative: {
                receiptNo: "2026000100",
                reportName: "유상증자 결정",
                tokens: ["유상증자", "결정"],
                classification: { score: 95, level: "high" },
              },
              items: [
                {
                  receiptNo: "2026000100",
                  reportName: "유상증자 결정",
                  tokens: ["유상증자", "결정"],
                  classification: { score: 95 },
                },
              ],
            }),
          ],
        },
      ],
    };

    const delta = diffDigest(prev, curr);

    expect(delta.newClusters).toHaveLength(1);
    expect(delta.newClusters[0]?.current.representativeTitle).toBe("유상증자 결정");

    expect(delta.updatedClusters).toHaveLength(1);
    expect(delta.updatedClusters[0]?.changes.itemsCountIncreased).toBe(true);
    expect(delta.updatedClusters[0]?.changes.representativeChanged).toBe(true);
    expect(delta.updatedClusters[0]?.changes.maxScoreIncreased).toBe(true);
    expect(delta.updatedClusters[0]?.changes.clusterScoreIncreased).toBe(true);

    expect(delta.highlightsHighMid).toHaveLength(2);
    expect(delta.highlightsHighMid[0]?.current.representativeLevel).toBe("high");
  });

  it("triggers strict-high only when new high cluster exists", () => {
    const prev = {
      companies: [
        {
          corpCode: "00126380",
          corpName: "삼성전자",
          clusters: [cluster({})],
        },
      ],
    };
    const currWithNewHigh = {
      companies: [
        {
          corpCode: "00126380",
          corpName: "삼성전자",
          clusters: [
            cluster({}),
            cluster({
              categoryId: "capital",
              representativeLevel: "high",
              representativeScore: 95,
              clusterScore: 99,
              representativeTitle: "유상증자 결정",
              representative: {
                receiptNo: "2026000100",
                reportName: "유상증자 결정",
                tokens: ["유상증자", "결정"],
                classification: { score: 95, level: "high" },
              },
              items: [
                {
                  receiptNo: "2026000100",
                  reportName: "유상증자 결정",
                  tokens: ["유상증자", "결정"],
                  classification: { score: 95 },
                },
              ],
            }),
          ],
        },
      ],
    };
    const currWithoutNewHigh = {
      companies: [
        {
          corpCode: "00126380",
          corpName: "삼성전자",
          clusters: [
            cluster({
              representativeLevel: "high",
              representativeScore: 90,
              clusterScore: 93,
              count: 3,
              representative: {
                receiptNo: "2026000011",
                reportName: "단일판매 공급계약 체결",
                tokens: ["단일판매", "공급계약", "체결"],
                classification: { score: 90, level: "high" },
              },
              items: [
                {
                  receiptNo: "2026000011",
                  reportName: "단일판매 공급계약 체결",
                  tokens: ["단일판매", "공급계약", "체결"],
                  classification: { score: 90 },
                },
                {
                  receiptNo: "2026000010",
                  reportName: "단일판매 공급계약 체결",
                  tokens: ["단일판매", "공급계약", "체결"],
                  classification: { score: 80 },
                },
                {
                  receiptNo: "2026000009",
                  reportName: "단일판매 공급계약 체결(첨부정정)",
                  tokens: ["단일판매", "공급계약", "체결"],
                  classification: { score: 79 },
                },
              ],
            }),
          ],
        },
      ],
    };

    const withNewHigh = diffDigest(prev, currWithNewHigh);
    const noNewHigh = diffDigest(prev, currWithoutNewHigh);

    expect(hasNewHighAlerts(withNewHigh)).toBe(true);
    expect(hasNewHighAlerts(noNewHigh)).toBe(false);
  });

  it("does not duplicate new clusters on same digest rerun", () => {
    const digest = {
      companies: [
        {
          corpCode: "00126380",
          corpName: "삼성전자",
          clusters: [cluster({})],
        },
      ],
    };

    const delta = diffDigest(digest, digest);
    expect(delta.newClusters).toHaveLength(0);
    expect(delta.updatedClusters).toHaveLength(0);
  });
});
