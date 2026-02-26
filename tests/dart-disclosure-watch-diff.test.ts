import { describe, expect, it } from "vitest";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - ESM .mjs import
import { extractNewDisclosures } from "../scripts/dart_disclosure_watch.mjs";

describe("dart disclosure watch diff", () => {
  it("extracts unseen disclosures and deduplicates by receipt number", () => {
    const previousSeen = ["202600000001", "202600000002"];
    const items = [
      { receiptNo: "202600000002", reportName: "already seen" },
      { receiptNo: "202600000003", reportName: "new #1" },
      { receiptNo: "202600000003", reportName: "new #1 duplicate" },
      { receiptNo: "202600000004", reportName: "new #2" },
      { reportName: "invalid without receipt number" },
    ];

    const diff = extractNewDisclosures(previousSeen, items);
    expect(diff.newItems.map((item: { receiptNo?: string }) => item.receiptNo)).toEqual([
      "202600000003",
      "202600000004",
    ]);
    expect(diff.nextSeenReceiptNos.slice(0, 4)).toEqual([
      "202600000002",
      "202600000003",
      "202600000004",
      "202600000001",
    ]);
  });

  it("stabilizes at zero new items after state is updated", () => {
    const firstRunItems = [
      { receiptNo: "202600000010", reportName: "A" },
      { receiptNo: "202600000011", reportName: "B" },
    ];

    const first = extractNewDisclosures([], firstRunItems);
    expect(first.newItems).toHaveLength(2);

    const second = extractNewDisclosures(first.nextSeenReceiptNos, firstRunItems);
    expect(second.newItems).toHaveLength(0);
  });

  it("respects maxSeenPerCorp limit", () => {
    const previousSeen = Array.from({ length: 4 }, (_, idx) => `20260000010${idx}`);
    const items = [
      { receiptNo: "202600000200", reportName: "n1" },
      { receiptNo: "202600000201", reportName: "n2" },
      { receiptNo: "202600000202", reportName: "n3" },
    ];

    const diff = extractNewDisclosures(previousSeen, items, { maxSeenPerCorp: 5 });
    expect(diff.nextSeenReceiptNos).toHaveLength(5);
    expect(diff.nextSeenReceiptNos).toEqual([
      "202600000200",
      "202600000201",
      "202600000202",
      "202600000100",
      "202600000101",
    ]);
  });
});
