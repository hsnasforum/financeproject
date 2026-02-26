import { describe, expect, it } from "vitest";
import { buildDailyBrief, toMarkdown } from "../src/lib/dart/dailyBriefBuilder";

describe("daily brief builder", () => {
  it("prioritizes pinned items before regular new/updated buckets", () => {
    const brief = buildDailyBrief({
      generatedAt: "2026-02-26T08:00:00.000Z",
      newHigh: [
        {
          id: "new-high-a",
          corpName: "알파",
          categoryLabel: "계약",
          title: "신규 공급 계약 체결",
          rceptNo: "202602260001",
          date: "20260226",
          clusterScore: 91,
        },
      ],
      updatedHigh: [
        {
          id: "upd-high-pinned",
          corpName: "감마",
          categoryLabel: "법무",
          title: "소송 진행 업데이트",
          rceptNo: "202602260002",
          date: "20260226",
          clusterScore: 88,
          isPinned: true,
          pinnedAt: "2026-02-26T09:00:00.000Z",
        },
      ],
    });

    expect(brief.lines[0]).toContain("감마");
    expect(brief.topUpdated[0]?.corpName).toBe("감마");
  });

  it("keeps new/updated top selections by bucket priority", () => {
    const brief = buildDailyBrief({
      newHigh: [
        { id: "nh", corpName: "A", categoryLabel: "계약", title: "new-high", rceptNo: "1", date: "20260226", clusterScore: 70 },
      ],
      newMid: [
        { id: "nm", corpName: "B", categoryLabel: "법무", title: "new-mid", rceptNo: "2", date: "20260226", clusterScore: 99 },
      ],
      updatedHigh: [
        { id: "uh", corpName: "C", categoryLabel: "기타", title: "upd-high", rceptNo: "3", date: "20260226", clusterScore: 60 },
      ],
      updatedMid: [
        { id: "um", corpName: "D", categoryLabel: "기타", title: "upd-mid", rceptNo: "4", date: "20260226", clusterScore: 99 },
      ],
    });

    expect(brief.topNew[0]?.id).toBe("nh");
    expect(brief.topUpdated[0]?.id).toBe("uh");
  });

  it("caps line count to 15 even when requested larger", () => {
    const many = Array.from({ length: 20 }, (_, index) => ({
      id: `n-${index}`,
      corpName: `Corp-${index}`,
      categoryLabel: "계약",
      title: `title-${index}`,
      rceptNo: `20260226${String(index).padStart(4, "0")}`,
      date: "20260226",
      clusterScore: 100 - index,
    }));

    const brief = buildDailyBrief({ newHigh: many }, { maxLines: 30 });
    const markdown = toMarkdown(brief);

    expect(brief.stats.maxLines).toBe(15);
    expect(brief.lines).toHaveLength(15);
    expect(markdown).toContain("## 10줄 요약");
  });
});
