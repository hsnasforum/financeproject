import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DataFreshnessBanner } from "../src/components/data/DataFreshnessBanner";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

describe("DataFreshnessBanner copy", () => {
  it("keeps auto smoke copy aligned with the session-limited toggle behavior", () => {
    const html = renderToStaticMarkup(
      <DataFreshnessBanner
        sources={[{ sourceId: "finlife", kind: "deposit", label: "예금" }]}
        showWhenFresh
      />,
    );

    expect(html).toContain("자동 스모크 업데이트는 토글이 켜진 경우 세션당 1회만 시도합니다.");
    expect(html).not.toContain("자동 동기화는 수행하지");
  });
});
