import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { OpsDashboardClient } from "../src/components/OpsDashboardClient";

describe("ops dashboard ui", () => {
  it("renders stable shell selectors with modal closed by default", () => {
    const html = renderToStaticMarkup(<OpsDashboardClient csrf="" />);

    expect(html).toContain('data-testid="ops-home"');
    expect(html).toContain("Ops Dashboard");
    expect(html).toContain('data-testid="ops-scheduler-summary"');
    expect(html).toContain("원클릭 액션");
    expect(html).toContain("최근 이벤트 미리보기");
    expect(html).toContain("Dev unlock/CSRF가 필요합니다.");
    expect(html).not.toContain('data-testid="ops-preview-modal"');
    expect(html).not.toContain('data-testid="ops-preview-confirm"');
  });
});
