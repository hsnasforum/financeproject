import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  permanentRedirect: vi.fn((href: string) => {
    throw new Error(`REDIRECT:${href}`);
  }),
}));

vi.mock("next/navigation", () => ({
  permanentRedirect: mocked.permanentRedirect,
}));

import ReportPage from "../src/app/report/page";

describe("legacy /report page redirect", () => {
  beforeEach(() => {
    mocked.permanentRedirect.mockClear();
  });

  it("redirects to planning report with runId query", async () => {
    await expect(ReportPage({
      searchParams: Promise.resolve({ runId: " run-123 " }),
    })).rejects.toThrow("REDIRECT:/planning/reports?runId=run-123");
    expect(mocked.permanentRedirect).toHaveBeenCalledWith("/planning/reports?runId=run-123");
  });

  it("redirects to planning report hub when runId is missing", async () => {
    await expect(ReportPage({
      searchParams: Promise.resolve({}),
    })).rejects.toThrow("REDIRECT:/planning/reports");
    expect(mocked.permanentRedirect).toHaveBeenCalledWith("/planning/reports");
  });
});
