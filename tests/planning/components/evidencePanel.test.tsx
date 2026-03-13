import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import EvidencePanel from "../../../src/components/planning/EvidencePanel";

describe("EvidencePanel", () => {
  it("renders plain-language monthly surplus explanation before advanced details", () => {
    const html = renderToStaticMarkup(
      <EvidencePanel
        item={{
          id: "monthlySurplus",
          title: "월 잉여현금",
          formula: "incomeNet - essential - discretionary - totalDebtPayment",
          inputs: [
            { label: "월 실수령", value: "6,970,000원", unitKind: "krw" },
            { label: "필수지출", value: "N/A", unitKind: "krw" },
            { label: "선택지출", value: "N/A", unitKind: "krw" },
            { label: "월 총지출(필수+선택)", value: "2,800,000원", unitKind: "krw" },
            { label: "월 부채상환", value: "11,135,000원", unitKind: "krw" },
            { label: "월 잉여현금", value: "-6,965,000원", unitKind: "krw" },
          ],
          assumptions: [
            "필수/선택지출이 분리 저장되지 않은 경우 월 총지출 입력값으로 대체 표시합니다.",
          ],
          notes: [
            "시작 시점(month=start) 기준 월값을 사용합니다.",
          ],
        }}
      />,
    );

    expect(html).toContain("쉽게 말하면");
    expect(html).toContain("이번 계산에서는 한 달에 들어오는 돈이 6,970,000원");
    expect(html).toContain("이번 계산에 사용한 값");
    expect(html).toContain("자세한 계산 기준 보기");
  });
});
