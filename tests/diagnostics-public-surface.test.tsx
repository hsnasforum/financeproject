import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FeedbackFormClient } from "../src/components/FeedbackFormClient";

const ROOT = process.cwd();
const DIAGNOSTICS_ROUTE = path.join(ROOT, "src", "app", "api", "diagnostics", "snapshot", "route.ts");
const FEEDBACK_FORM = path.join(ROOT, "src", "components", "FeedbackFormClient.tsx");
const FEEDBACK_ROUTE = path.join(ROOT, "src", "app", "api", "feedback", "route.ts");

describe("standalone diagnostics public surface", () => {
  it("does not publish a standalone diagnostics route", () => {
    expect(fs.existsSync(DIAGNOSTICS_ROUTE)).toBe(false);
  });

  it("keeps feedback submission without a diagnostics fetch or download action", () => {
    const source = fs.readFileSync(FEEDBACK_FORM, "utf8");
    const feedbackRouteSource = fs.readFileSync(FEEDBACK_ROUTE, "utf8");
    const html = renderToStaticMarkup(createElement(FeedbackFormClient));

    expect(source).not.toContain("/api/diagnostics/snapshot");
    expect(source).not.toContain("diagnostics_bundle.json");
    expect(feedbackRouteSource).not.toContain("body.snapshot");
    expect(feedbackRouteSource).not.toContain("normalizeDiagnosticsSnapshot");
    expect(feedbackRouteSource).not.toContain("parseDiagnosticsPageInfoFromRequest");
    expect(feedbackRouteSource).toContain("addPublicFeedback");
    expect(feedbackRouteSource).toContain("toFeedbackPublicReceipt");
    expect(html).toContain("내용 저장하기");
    expect(html).not.toContain("공유용 진단 번들");
  });
});
