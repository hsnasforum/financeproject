import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DartSearchClient } from "../src/components/DartSearchClient";

describe("DartSearchClient initial state", () => {
  it("shows search guidance before the first search", () => {
    const html = renderToStaticMarkup(<DartSearchClient />);

    expect(html).toContain("회사명을 입력하고 검색해 보세요");
    expect(html).toContain("예: 삼성전자, 카카오, 네이버");
    expect(html).toContain("최신 공시와 기업 정보를 바로 확인할 수 있습니다.");
    expect(html).not.toContain("검색 결과가 없습니다.");
  });
});
