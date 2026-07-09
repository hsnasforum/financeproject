import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  getAdminNavItems,
  getPublicBottomNavItems,
  getPublicDesktopNavItems,
  isNavigationItemActive,
  resolveRouteVisibility,
} from "../src/lib/navigation/routeRegistry";

const siteHeaderPath = fileURLToPath(new URL("../src/components/SiteHeader.tsx", import.meta.url));
const mobileBottomNavPath = fileURLToPath(new URL("../src/components/ui/MobileBottomNav.tsx", import.meta.url));
const serviceLinksPath = fileURLToPath(new URL("../src/components/home/ServiceLinks.tsx", import.meta.url));

describe("navigation route registry", () => {
  it("feeds desktop and mobile public nav from the same route source", () => {
    const desktop = getPublicDesktopNavItems();
    const mobile = getPublicBottomNavItems();

    expect(desktop.map((item) => item.id)).toEqual(["dashboard", "planning", "recommend", "products", "settings"]);
    expect(mobile.map((item) => item.id)).toEqual(desktop.map((item) => item.id));
    expect(mobile.map((item) => item.href)).toEqual(desktop.map((item) => item.href));
  });

  it("keeps ops/dev/debug routes out of public nav entries", () => {
    const publicEntries = [...getPublicDesktopNavItems(), ...getPublicBottomNavItems()];
    for (const item of publicEntries) {
      const values = [item.href, ...(item.includePrefixes ?? [])];
      expect(values.some((value) => value.startsWith("/ops"))).toBe(false);
      expect(values.some((value) => value.startsWith("/dev"))).toBe(false);
      expect(values.some((value) => value.startsWith("/debug"))).toBe(false);
      expect(values.some((value) => value.startsWith("/dashboard/artifacts"))).toBe(false);
      expect(item.visibility).toBe("public-stable");
    }

    expect(getAdminNavItems().map((item) => item.href)).toEqual(["/ops"]);
  });

  it("separates planning v3 official beta entries from internal v3 routes", () => {
    expect(resolveRouteVisibility("/planning/v3/transactions")).toMatchObject({
      visibility: "public-beta",
      status: "official-beta-entry",
    });
    expect(resolveRouteVisibility("/planning/v3/transactions/batches")).toMatchObject({
      visibility: "public-beta",
      status: "official-beta-entry",
    });
    expect(resolveRouteVisibility("/planning/v3/balances")).toMatchObject({
      visibility: "public-beta",
      status: "official-beta-entry",
    });
    expect(resolveRouteVisibility("/planning/v3/profile/drafts")).toMatchObject({
      visibility: "public-beta",
      status: "official-beta-entry",
    });

    expect(resolveRouteVisibility("/planning/v3/news")).toMatchObject({ visibility: "internal", status: "internal" });
    expect(resolveRouteVisibility("/planning/v3/transactions/batches/demo")).toMatchObject({
      visibility: "internal",
      status: "internal",
    });
  });

  it("keeps product-adjacent public routes active under financial exploration", () => {
    const products = getPublicDesktopNavItems().find((item) => item.id === "products");
    expect(products).toBeTruthy();
    if (!products) return;

    for (const route of ["/benefits", "/public/dart", "/housing/subscription", "/tools/fx", "/invest/companies", "/compare", "/gov24"]) {
      expect(isNavigationItemActive(route, products)).toBe(true);
    }
  });

  it("keeps nav consumers on the shared registry instead of local item arrays", () => {
    const siteHeader = fs.readFileSync(siteHeaderPath, "utf8");
    const mobileBottomNav = fs.readFileSync(mobileBottomNavPath, "utf8");
    const serviceLinks = fs.readFileSync(serviceLinksPath, "utf8");

    expect(siteHeader).toContain("getPublicDesktopNavItems");
    expect(siteHeader).not.toMatch(/const publicNavItems\s*[:=]\s*\[/);
    expect(mobileBottomNav).toContain("getPublicBottomNavItems");
    expect(mobileBottomNav).not.toMatch(/const navItems\s*[:=]\s*\[/);
    expect(serviceLinks).toContain("getPublicDesktopNavItems");
  });
});
