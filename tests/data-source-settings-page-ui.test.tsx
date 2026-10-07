import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import DataSourcesSettingsPage from "../src/app/settings/data-sources/page";

describe("data source settings page UI", () => {
  it("keeps the user impact overview first and source or operator details collapsed", async () => {
    const html = renderToStaticMarkup(await DataSourcesSettingsPage());

    const overviewIndex = html.indexOf('data-testid="data-source-overview"');
    const firstDisclosureIndex = html.indexOf('data-testid="data-source-disclosure-impact"');

    expect(overviewIndex).toBeGreaterThanOrEqual(0);
    expect(firstDisclosureIndex).toBeGreaterThan(overviewIndex);
    expect(html).toContain('data-testid="data-source-disclosure-primary"');
    expect(html).toContain('data-testid="data-source-disclosure-optional"');
    expect(html).toContain('data-testid="data-source-disclosure-operations"');
    expect(html).not.toMatch(/<details\b[^>]*\sopen(?:=|\s|>)/);
  });
});
