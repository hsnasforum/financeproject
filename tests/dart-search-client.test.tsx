import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DartSearchClient } from "../src/components/DartSearchClient";

describe("DartSearchClient initial state", () => {
  it("shows search guidance before the first search", () => {
    const html = renderToStaticMarkup(<DartSearchClient />);

    expect(html).toContain("회사명을 입력하고 검색해 보세요");
    expect(html).toContain("예: 삼성전자, 카카오, 네이버");
    expect(html).toContain("현재 공시 기준으로 회사 개황과 최근 공시 흐름을 이어서 확인할 수 있습니다.");
    expect(html).not.toContain("검색 결과가 없습니다.");
  });
});
