import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ProductCandidatesPanel from "../../../src/components/planning/ProductCandidatesPanel";

describe("ProductCandidatesPanel", () => {
  it("renders candidates evidence toggle", () => {
    const html = renderToStaticMarkup(<ProductCandidatesPanel />);
    expect(html).toContain('data-testid="candidates-evidence-toggle"');
    expect(html).toContain('data-testid="candidates-evidence-panel"');
  });
});
