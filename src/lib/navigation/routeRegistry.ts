export type RouteVisibility = "public-stable" | "public-beta" | "legacy" | "ops" | "dev" | "internal";
export type RouteStatus = "stable" | "official-beta-entry" | "legacy-redirect" | "ops" | "dev-debug" | "internal";
export type NavIconKey = "home" | "planning" | "recommend" | "explore" | "settings";

export type NavigationRouteEntry = {
  id: string;
  href: string;
  label: string;
  mobileLabel?: string;
  group: "main" | "admin" | "beta" | "internal" | "legacy" | "dev";
  visibility: RouteVisibility;
  status: RouteStatus;
  match: "exact" | "prefix";
  includePrefixes?: string[];
  excludePrefixes?: string[];
  desktop?: boolean;
  mobile?: boolean;
  admin?: boolean;
  icon?: NavIconKey;
};

export const NAVIGATION_ROUTE_REGISTRY: NavigationRouteEntry[] = [
  {
    id: "dashboard",
    href: "/dashboard",
    label: "홈",
    mobileLabel: "홈",
    group: "main",
    visibility: "public-stable",
    status: "stable",
    match: "prefix",
    desktop: true,
    mobile: true,
    icon: "home",
  },
  {
    id: "planning",
    href: "/planning",
    label: "재무진단",
    mobileLabel: "진단",
    group: "main",
    visibility: "public-stable",
    status: "stable",
    match: "prefix",
    desktop: true,
    mobile: true,
    icon: "planning",
  },
  {
    id: "recommend",
    href: "/recommend",
    label: "상품추천",
    mobileLabel: "추천",
    group: "main",
    visibility: "public-stable",
    status: "stable",
    match: "prefix",
    desktop: true,
    mobile: true,
    icon: "recommend",
  },
  {
    id: "products",
    href: "/products",
    label: "금융탐색",
    mobileLabel: "탐색",
    group: "main",
    visibility: "public-stable",
    status: "stable",
    match: "prefix",
    includePrefixes: ["/benefits", "/public", "/housing", "/tools", "/invest", "/compare", "/gov24"],
    desktop: true,
    mobile: true,
    icon: "explore",
  },
  {
    id: "settings",
    href: "/settings",
    label: "내 설정",
    mobileLabel: "설정",
    group: "main",
    visibility: "public-stable",
    status: "stable",
    match: "prefix",
    desktop: true,
    mobile: true,
    icon: "settings",
  },
  {
    id: "ops",
    href: "/ops",
    label: "Ops",
    group: "admin",
    visibility: "ops",
    status: "ops",
    match: "prefix",
    admin: true,
  },
  {
    id: "planning-v3-transactions",
    href: "/planning/v3/transactions",
    label: "거래",
    group: "beta",
    visibility: "public-beta",
    status: "official-beta-entry",
    match: "exact",
  },
  {
    id: "planning-v3-transaction-batches",
    href: "/planning/v3/transactions/batches",
    label: "거래 묶음",
    group: "beta",
    visibility: "public-beta",
    status: "official-beta-entry",
    match: "exact",
  },
  {
    id: "planning-v3-balances",
    href: "/planning/v3/balances",
    label: "월별 잔액",
    group: "beta",
    visibility: "public-beta",
    status: "official-beta-entry",
    match: "exact",
  },
  {
    id: "planning-v3-profile-drafts",
    href: "/planning/v3/profile/drafts",
    label: "프로필 초안",
    group: "beta",
    visibility: "public-beta",
    status: "official-beta-entry",
    match: "exact",
  },
  {
    id: "planning-v3-internal",
    href: "/planning/v3",
    label: "Planning v3 internal",
    group: "internal",
    visibility: "internal",
    status: "internal",
    match: "prefix",
  },
  {
    id: "legacy-report",
    href: "/report",
    label: "Legacy report",
    group: "legacy",
    visibility: "legacy",
    status: "legacy-redirect",
    match: "prefix",
  },
  {
    id: "legacy-planner",
    href: "/planner",
    label: "Legacy planner",
    group: "legacy",
    visibility: "legacy",
    status: "legacy-redirect",
    match: "prefix",
  },
  {
    id: "dev-debug",
    href: "/dev",
    label: "Dev/debug",
    group: "dev",
    visibility: "dev",
    status: "dev-debug",
    match: "prefix",
    includePrefixes: ["/debug", "/dashboard/artifacts"],
  },
];

export function getPublicDesktopNavItems(): NavigationRouteEntry[] {
  return NAVIGATION_ROUTE_REGISTRY.filter((item) => item.visibility === "public-stable" && item.desktop === true);
}

export function getPublicMobileStripNavItems(): NavigationRouteEntry[] {
  return getPublicDesktopNavItems();
}

export function getPublicBottomNavItems(): NavigationRouteEntry[] {
  return NAVIGATION_ROUTE_REGISTRY.filter((item) => item.visibility === "public-stable" && item.mobile === true);
}

export function getAdminNavItems(): NavigationRouteEntry[] {
  return NAVIGATION_ROUTE_REGISTRY.filter((item) => item.admin === true);
}

function normalizeRoutePath(pathname: string): string {
  const pathOnly = pathname.split(/[?#]/, 1)[0]?.trim() || "/";
  const withLeadingSlash = pathOnly.startsWith("/") ? pathOnly : `/${pathOnly}`;
  return withLeadingSlash === "/" ? "/" : withLeadingSlash.replace(/\/+$/, "");
}

export function isSegmentAwarePrefixMatch(pathname: string, prefix: string): boolean {
  const normalizedPathname = normalizeRoutePath(pathname);
  const normalizedPrefix = normalizeRoutePath(prefix);
  return normalizedPathname === normalizedPrefix || normalizedPathname.startsWith(`${normalizedPrefix}/`);
}

export function isNavigationItemActive(pathname: string, item: NavigationRouteEntry): boolean {
  if (item.excludePrefixes?.some((prefix) => isSegmentAwarePrefixMatch(pathname, prefix))) {
    return false;
  }
  if (item.includePrefixes?.some((prefix) => isSegmentAwarePrefixMatch(pathname, prefix))) {
    return true;
  }
  if (item.match === "exact") {
    return normalizeRoutePath(pathname) === normalizeRoutePath(item.href);
  }
  return isSegmentAwarePrefixMatch(pathname, item.href);
}

export function resolveRouteVisibility(pathname: string): Pick<NavigationRouteEntry, "id" | "href" | "visibility" | "status"> {
  const devMatch = NAVIGATION_ROUTE_REGISTRY.find((item) => item.visibility === "dev" && isNavigationItemActive(pathname, item));
  if (devMatch) {
    return {
      id: devMatch.id,
      href: devMatch.href,
      visibility: devMatch.visibility,
      status: devMatch.status,
    };
  }

  const exactMatch = NAVIGATION_ROUTE_REGISTRY.find((item) => item.match === "exact" && pathname === item.href);
  if (exactMatch) {
    return {
      id: exactMatch.id,
      href: exactMatch.href,
      visibility: exactMatch.visibility,
      status: exactMatch.status,
    };
  }

  const nonPublicPrefixMatch = NAVIGATION_ROUTE_REGISTRY.find(
    (item) => item.match === "prefix" && item.visibility !== "public-stable" && isNavigationItemActive(pathname, item),
  );
  if (nonPublicPrefixMatch) {
    return {
      id: nonPublicPrefixMatch.id,
      href: nonPublicPrefixMatch.href,
      visibility: nonPublicPrefixMatch.visibility,
      status: nonPublicPrefixMatch.status,
    };
  }

  const prefixMatch = NAVIGATION_ROUTE_REGISTRY.find((item) => item.match === "prefix" && isNavigationItemActive(pathname, item));
  if (prefixMatch) {
    return {
      id: prefixMatch.id,
      href: prefixMatch.href,
      visibility: prefixMatch.visibility,
      status: prefixMatch.status,
    };
  }

  return {
    id: "unlisted-public",
    href: pathname,
    visibility: "public-stable",
    status: "stable",
  };
}

export function isOpsOrDevRoute(pathname: string): boolean {
  const route = resolveRouteVisibility(pathname);
  return route.visibility === "ops" || route.visibility === "dev";
}
