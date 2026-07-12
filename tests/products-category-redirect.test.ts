import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  redirect: vi.fn((href: string) => {
    throw new Error(`redirect:${href}`);
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: mocked.redirect,
}));

import ComparePage from "../src/app/compare/page";
import DepositProductsPage from "../src/app/products/deposit/page";
import SavingProductsPage from "../src/app/products/saving/page";
import { resolveRouteVisibility } from "../src/lib/navigation/routeRegistry";

describe("product category compatibility routes", () => {
  beforeEach(() => {
    mocked.redirect.mockClear();
  });

  it("redirects deposit category to catalog preset and preserves supported filters", async () => {
    await expect(DepositProductsPage({
      searchParams: Promise.resolve({
        q: "국민",
        termMonths: "12",
        topFinGrpNo: "020000",
      }),
    })).rejects.toThrow("redirect:/products/catalog?kind=deposit&q=%EA%B5%AD%EB%AF%BC&termMonths=12");

    expect(mocked.redirect).toHaveBeenCalledWith("/products/catalog?kind=deposit&q=%EA%B5%AD%EB%AF%BC&termMonths=12");
    expect(resolveRouteVisibility("/products/deposit").canonicalHref).toBe("/products/catalog?kind=deposit");
  });

  it("redirects saving category to catalog preset", async () => {
    await expect(SavingProductsPage({
      searchParams: Promise.resolve({
        q: "청년",
        minRate: "3",
      }),
    })).rejects.toThrow("redirect:/products/catalog?kind=saving&q=%EC%B2%AD%EB%85%84&minRate=3");

    expect(mocked.redirect).toHaveBeenCalledWith("/products/catalog?kind=saving&q=%EC%B2%AD%EB%85%84&minRate=3");
    expect(resolveRouteVisibility("/products/saving").canonicalHref).toBe("/products/catalog?kind=saving");
  });

  it("redirects the compare alias to the registry canonical page", () => {
    const canonicalHref = resolveRouteVisibility("/compare").canonicalHref;
    expect(() => ComparePage()).toThrow(`redirect:${canonicalHref}`);
    expect(mocked.redirect).toHaveBeenCalledWith("/products/compare");
  });
});
