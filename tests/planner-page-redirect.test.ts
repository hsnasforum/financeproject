import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  redirect: vi.fn((href: string) => {
    throw new Error(`REDIRECT:${href}`);
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: mocked.redirect,
}));

import PlannerPage from "../src/app/planner/page";
import PlannerCatchAllPage from "../src/app/planner/[...slug]/page";

describe("legacy /planner redirect pages", () => {
  beforeEach(() => {
    mocked.redirect.mockClear();
  });

  it("redirects /planner to /planning", async () => {
    expect(() => PlannerPage()).toThrow("REDIRECT:/planning");
    expect(mocked.redirect).toHaveBeenCalledWith("/planning");
  });

  it("keeps supported planning subpaths when redirecting /planner/[...slug]", async () => {
    await expect(PlannerCatchAllPage({
      params: Promise.resolve({ slug: ["reports", "prototype"] }),
    })).rejects.toThrow("REDIRECT:/planning/reports/prototype");
    expect(mocked.redirect).toHaveBeenCalledWith("/planning/reports/prototype");
  });

  it("falls back to /planning for unsupported legacy planner deep links", async () => {
    await expect(PlannerCatchAllPage({
      params: Promise.resolve({ slug: ["legacy", "result"] }),
    })).rejects.toThrow("REDIRECT:/planning");
    expect(mocked.redirect).toHaveBeenCalledWith("/planning");
  });
});
