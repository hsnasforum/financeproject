import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { OpsMetricsClient } from "../src/components/OpsMetricsClient";
import { OpsMetricsEventsSection } from "../src/components/opsMetrics/sections";

describe("ops metrics ui", () => {
  it("renders stable summary selectors in the client shell", () => {
    const html = renderToStaticMarkup(<OpsMetricsClient />);

    expect(html).toContain('data-testid="ops-metrics"');
    expect(html).toContain('data-testid="metrics-summary"');
    expect(html).toContain('data-testid="planning-fallback-summary"');
    expect(html).toContain("Planning fallback usage");
  });

  it("renders metrics events selector when rows exist", () => {
    const html = renderToStaticMarkup(
      <OpsMetricsEventsSection
        rows={[
          {
            at: "2026-04-11T00:00:00.000Z",
            type: "RUN_PIPELINE",
            status: "SUCCESS",
            runId: "run-123456",
            durationMs: 420,
          },
        ]}
        loading={false}
        error=""
        onRetry={() => {}}
      />,
    );

    expect(html).toContain('data-testid="metrics-events"');
    expect(html).toContain("RUN_PIPELINE");
    expect(html).toContain("SUCCESS");
  });
});
