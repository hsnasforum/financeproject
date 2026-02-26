import { describe, expect, it } from "vitest";
import { clusterByCorp, type DisclosureClusterItem } from "../src/lib/dart/disclosureCluster";

function item(input: Partial<DisclosureClusterItem> & { receiptNo: string; receiptDate: string }): DisclosureClusterItem {
  return {
    corpCode: "00126380",
    corpName: "삼성전자",
    reportName: "기본 공시",
    normalizedTitle: "기본 공시",
    tokens: ["기본", "공시"],
    classification: { score: 60, level: "mid", categoryId: "disposition", categoryLabel: "정정/해명/기타" },
    ...input,
  };
}

describe("disclosure cluster", () => {
  it("clusters similar titles in time window", () => {
    const rows: DisclosureClusterItem[] = [
      item({
        receiptNo: "2026003",
        receiptDate: "20260203",
        reportName: "단일판매 공급계약 체결",
        normalizedTitle: "단일판매 공급계약 체결",
        tokens: ["단일판매", "공급계약", "체결"],
        classification: { score: 78, level: "mid", categoryId: "contract", categoryLabel: "공급계약/소송" },
      }),
      item({
        receiptNo: "2026002",
        receiptDate: "20260202",
        reportName: "정정 단일판매 공급계약 체결",
        normalizedTitle: "단일판매 공급계약 체결",
        tokens: ["단일판매", "공급계약", "체결"],
        classification: { score: 85, level: "high", categoryId: "contract", categoryLabel: "공급계약/소송" },
      }),
      item({
        receiptNo: "2026001",
        receiptDate: "20260110",
        reportName: "주주총회 소집결의",
        normalizedTitle: "주주총회 소집결의",
        tokens: ["주주총회", "소집결의"],
        classification: { score: 62, level: "mid", categoryId: "governance", categoryLabel: "지배구조/임원" },
      }),
    ];

    const clusters = clusterByCorp(rows, {
      windowDays: 10,
      minTokenOverlap: 0.34,
      maxClusterSize: 8,
    });

    expect(clusters).toHaveLength(2);
    expect(clusters[0]?.count).toBe(2);
    expect(clusters[0]?.representative.receiptNo).toBe("2026002");
    expect(clusters[1]?.count).toBe(1);
  });

  it("respects maxClusterSize and creates extra cluster", () => {
    const rows: DisclosureClusterItem[] = [
      item({ receiptNo: "1", receiptDate: "20260203", tokens: ["a", "b", "c"] }),
      item({ receiptNo: "2", receiptDate: "20260202", tokens: ["a", "b", "c"] }),
      item({ receiptNo: "3", receiptDate: "20260201", tokens: ["a", "b", "c"] }),
    ];

    const clusters = clusterByCorp(rows, {
      windowDays: 10,
      minTokenOverlap: 0.2,
      maxClusterSize: 2,
    });

    expect(clusters).toHaveLength(2);
    expect(clusters[0]?.count).toBe(2);
    expect(clusters[1]?.count).toBe(1);
  });

  it("does not merge across different categories even with high token overlap", () => {
    const rows: DisclosureClusterItem[] = [
      item({
        receiptNo: "2026102",
        receiptDate: "20260212",
        reportName: "소송 등의 제기",
        normalizedTitle: "소송 등의 제기",
        tokens: ["소송", "제기", "계약"],
        classification: { score: 80, level: "high", categoryId: "legal", categoryLabel: "공급계약/소송" },
      }),
      item({
        receiptNo: "2026101",
        receiptDate: "20260211",
        reportName: "소송 등의 제기",
        normalizedTitle: "소송 등의 제기",
        tokens: ["소송", "제기", "계약"],
        classification: { score: 79, level: "mid", categoryId: "contract", categoryLabel: "공급계약/소송" },
      }),
    ];

    const clusters = clusterByCorp(rows, {
      windowDays: 10,
      minTokenOverlap: 0.2,
      maxClusterSize: 8,
    });

    expect(clusters).toHaveLength(2);
    expect(new Set(clusters.map((cluster) => cluster.categoryId))).toEqual(new Set(["contract", "legal"]));
    expect(clusters[0]?.count).toBe(1);
    expect(clusters[1]?.count).toBe(1);
  });
});
