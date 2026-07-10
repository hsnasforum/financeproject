import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ProductsHomePage from "../src/app/products/page";
import { NAVIGATION_ROUTE_REGISTRY } from "../src/lib/navigation/routeRegistry";

describe("products home entry policy", () => {
  it("keeps the unified catalog primary and specialized product routes secondary", () => {
    const html = renderToStaticMarkup(<ProductsHomePage />);
    const primaryIndex = html.indexOf('data-products-entry-tier="primary"');
    const presetIndex = html.indexOf('data-products-entry-tier="catalog-preset"');
    const specializedIndex = html.indexOf('data-products-entry-tier="specialized"');

    expect(primaryIndex).toBeGreaterThanOrEqual(0);
    expect(presetIndex).toBeGreaterThan(primaryIndex);
    expect(specializedIndex).toBeGreaterThan(presetIndex);
    expect(html.match(/href="\/products\/catalog"/g)).toHaveLength(1);
    expect(html).toContain('href="/products/catalog?kind=deposit"');
    expect(html).toContain('href="/products/catalog?kind=saving"');
    expect(html).toContain('aria-label="연금·대출 별도 상품군"');
    expect(html).toContain('href="/products/mortgage-loan"');
    expect(html).toContain('href="/products/pension"');
    expect(html).toContain('href="/products/rent-house-loan"');
    expect(html).toContain('href="/products/credit-loan"');
    expect(html).not.toContain("<button");
    expect(html.toLowerCase()).not.toContain("samplebank");
  });

  it("keeps the public navigation entry on the products gateway", () => {
    const productsEntry = NAVIGATION_ROUTE_REGISTRY.find((entry) => entry.id === "products");

    expect(productsEntry).toMatchObject({
      href: "/products",
      visibility: "public-stable",
      status: "stable",
      desktop: true,
      mobile: true,
    });
  });
});
