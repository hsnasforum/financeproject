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

  it("keeps only deep links that match an explicitly registered planning page", async () => {
    await expect(PlannerCatchAllPage({
      params: Promise.resolve({ slug: ["runs", "run-1"] }),
    })).rejects.toThrow("REDIRECT:/planning/runs/run-1");
    expect(mocked.redirect).toHaveBeenLastCalledWith("/planning/runs/run-1");

    await expect(PlannerCatchAllPage({
      params: Promise.resolve({ slug: ["v3", "batches", "batch-1"] }),
    })).rejects.toThrow("REDIRECT:/planning/v3/batches/batch-1");
    expect(mocked.redirect).toHaveBeenLastCalledWith("/planning/v3/batches/batch-1");
  });

  it("resolves a registered planning redirect alias to its canonical page", async () => {
    await expect(PlannerCatchAllPage({
      params: Promise.resolve({ slug: ["v3", "transactions"] }),
    })).rejects.toThrow("REDIRECT:/planning/v3/transactions/batches");
    expect(mocked.redirect).toHaveBeenLastCalledWith("/planning/v3/transactions/batches");
  });

  it("falls back to /planning for unsupported legacy planner deep links", async () => {
    await expect(PlannerCatchAllPage({
      params: Promise.resolve({ slug: ["legacy", "result"] }),
    })).rejects.toThrow("REDIRECT:/planning");
    expect(mocked.redirect).toHaveBeenCalledWith("/planning");
  });

  it("falls back when a supported head would still resolve to an unregistered page", async () => {
    for (const slug of [["v3"], ["reports", "run-1", "detail"], ["trash", "item-1"]]) {
      await expect(PlannerCatchAllPage({
        params: Promise.resolve({ slug }),
      })).rejects.toThrow("REDIRECT:/planning");
      expect(mocked.redirect).toHaveBeenLastCalledWith("/planning");
    }
  });
});
