import { describe, expect, it } from "vitest";
import {
  computeTopicContradictions,
  contradictionGradeFromCounts,
} from "./contradiction";

describe("planning v3 news contradiction", () => {
  it("computes high contradiction when opposite signals coexist", () => {
    const rows = computeTopicContradictions([
      {
        topicId: "rates",
        topicLabel: "금리",
        title: "기준금리 인상 압력 확대",
        snippet: "긴축 기조가 이어질 수 있다는 분석",
      },
      {
        topicId: "rates",
        topicLabel: "금리",
        title: "기준금리 인하 가능성 부각",
        snippet: "완화 전환 기대가 확산",
      },
      {
        topicId: "rates",
        topicLabel: "금리",
        title: "금리 하락 전망과 긴축 우려가 혼재",
        snippet: "인상/인하 신호가 동시에 언급됨",
      },
      {
        topicId: "rates",
        topicLabel: "금리",
        title: "기준금리 긴축 기조 재확인",
        snippet: "인상 가능성 유지",
      },
      {
        topicId: "rates",
        topicLabel: "금리",
        title: "완화 전환 기대 재부각",
        snippet: "인하 기대가 커짐",
      },
      {
        topicId: "fx",
        topicLabel: "환율",
        title: "환율 상승 압력 확대",
        snippet: "달러 강세",
      },
    ]);

    expect(rows.length).toBeGreaterThan(1);
    expect(rows[0]?.topicId).toBe("rates");
    expect(rows[0]?.contradictionGrade).toBe("high");
    expect(rows[0]?.signalBalance).toBeGreaterThan(0.45);
  });

  it("keeps low contradiction for single-direction topic", () => {
    const rows = computeTopicContradictions([
      {
        topicId: "fx",
        topicLabel: "환율",
        title: "환율 상승 압력 확대",
        snippet: "강세 흐름",
      },
      {
        topicId: "fx",
        topicLabel: "환율",
        title: "환율 상승세 지속",
        snippet: "상승 모멘텀",
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].contradictionGrade).toBe("low");
    expect(rows[0].downSignals).toBe(0);
  });

  it("derives deterministic grade from counts", () => {
    expect(contradictionGradeFromCounts({ upSignals: 0, downSignals: 0 })).toBe("low");
    expect(contradictionGradeFromCounts({ upSignals: 2, downSignals: 1 })).toBe("med");
    expect(contradictionGradeFromCounts({ upSignals: 3, downSignals: 3 })).toBe("high");
  });
});
