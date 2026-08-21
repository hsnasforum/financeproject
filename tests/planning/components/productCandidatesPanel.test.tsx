import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ProductCandidatesPanel from "../../../src/components/planning/ProductCandidatesPanel";

describe("ProductCandidatesPanel", () => {
  it("renders candidates evidence toggle", () => {
    const html = renderToStaticMarkup(<ProductCandidatesPanel />);
    expect(html).toContain('data-testid="candidates-evidence-toggle"');
    expect(html).toContain('data-testid="candidates-evidence-panel"');
    expect(html).toContain("최고금리 기준으로만 계산");
    expect(html).toContain("선택한 금리·기간·이자 방식 정보가 없으면 후보에서 제외됩니다.");
    expect(html).toContain("단리·복리는 상품 옵션 공시값을 사용합니다.");
  });
});
