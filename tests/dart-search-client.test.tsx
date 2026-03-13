import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DartSearchClient } from "../src/components/DartSearchClient";

describe("DartSearchClient initial state", () => {
  it("shows search guidance before the first search", () => {
    const html = renderToStaticMarkup(<DartSearchClient />);

    expect(html).toContain("회사명을 입력하고 검색해 보세요.");
    expect(html).toContain("예: 삼성전자, 네이버, 카카오");
    expect(html).toContain("검색이 성공하면 최근 검색어를 여기에 저장해 두고 다시 바로 찾을 수 있습니다.");
    expect(html).not.toContain("검색 결과가 없습니다.");
  });
});
