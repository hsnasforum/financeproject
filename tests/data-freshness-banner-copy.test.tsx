import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DataFreshnessBanner } from "../src/components/data/DataFreshnessBanner";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

describe("DataFreshnessBanner copy", () => {
  it("keeps freshness UI read-only and points local operators to CLI refresh", () => {
    const html = renderToStaticMarkup(
      <DataFreshnessBanner
        sources={[{ sourceId: "finlife", kind: "deposit", label: "예금" }]}
        showWhenFresh
      />,
    );

    expect(html).toContain("이 화면은 저장된 상태만 확인합니다.");
    expect(html).toContain("pnpm live:smoke");
    expect(html).not.toContain("자동 스모크 업데이트");
    expect(html).not.toContain("스모크 업데이트 중");
  });
});
