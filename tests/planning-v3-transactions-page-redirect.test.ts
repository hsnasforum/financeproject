import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  redirect: vi.fn((href: string) => {
    throw new Error(`REDIRECT:${href}`);
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: mocked.redirect,
}));

import PlanningV3TransactionsPage from "../src/app/planning/v3/transactions/page";

describe("planning v3 transactions page redirect", () => {
  beforeEach(() => {
    mocked.redirect.mockClear();
  });

  it("redirects /planning/v3/transactions to canonical batches list", () => {
    expect(() => PlanningV3TransactionsPage()).toThrow("REDIRECT:/planning/v3/transactions/batches");
    expect(mocked.redirect).toHaveBeenCalledWith("/planning/v3/transactions/batches");
  });
});
