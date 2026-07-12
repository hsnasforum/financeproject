export type RouteVisibility = "public-stable" | "public-beta" | "legacy" | "ops" | "dev" | "internal";
export type RouteStatus = "stable" | "beta" | "official-beta-entry" | "legacy-redirect" | "ops" | "dev-debug" | "internal" | "unknown";
export type RoutePolicyKind = "page" | "redirect";
export type NavIconKey = "home" | "planning" | "recommend" | "explore" | "settings";

export type PageRoutePolicyEntry = {
  pattern: string;
  kind: "page";
  visibility: RouteVisibility;
  status: RouteStatus;
};

export type RedirectRoutePolicyEntry = {
  pattern: string;
  kind: "redirect";
  canonicalHref: string;
  visibility: RouteVisibility;
  status: RouteStatus;
};

export type RoutePolicyEntry = PageRoutePolicyEntry | RedirectRoutePolicyEntry;

export type ResolvedRoutePolicy = {
  id: string;
  href: string;
  kind: RoutePolicyKind | "unknown";
  canonicalHref?: string;
  visibility: RouteVisibility;
  status: RouteStatus;
};

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

const PUBLIC_STABLE_PAGE_PATTERNS = [
  "/",
  "/benefits",
  "/dashboard",
  "/feedback",
  "/feedback/[id]",
  "/feedback/list",
  "/gov24",
  "/help",
  "/housing/afford",
  "/housing/subscription",
  "/invest/companies",
  "/planning",
  "/planning/reports",
  "/planning/reports/[id]",
  "/planning/runs",
  "/planning/runs/[id]",
  "/planning/trash",
  "/products",
  "/products/catalog",
  "/products/catalog/[id]",
  "/products/compare",
  "/products/credit-loan",
  "/products/mortgage-loan",
  "/products/pension",
  "/products/rent-house-loan",
  "/public/dart",
  "/public/dart/company",
  "/recommend",
  "/recommend/history",
  "/settings",
  "/settings/alerts",
  "/settings/backup",
  "/settings/data-sources",
  "/settings/maintenance",
  "/settings/recovery",
  "/tools/fx",
] as const;

const PUBLIC_BETA_PAGE_PATTERNS = [
  "/planning/reports/prototype",
] as const;

const OFFICIAL_BETA_PAGE_PATTERNS = [
  "/planning/v3/balances",
  "/planning/v3/profile/drafts",
  "/planning/v3/transactions/batches",
] as const;

const INTERNAL_PAGE_PATTERNS = [
  "/planning/v3/accounts",
  "/planning/v3/batches",
  "/planning/v3/batches/[id]",
  "/planning/v3/categories/rules",
  "/planning/v3/drafts",
  "/planning/v3/drafts/[id]",
  "/planning/v3/drafts/profile",
  "/planning/v3/exposure",
  "/planning/v3/import/csv",
  "/planning/v3/journal",
  "/planning/v3/news",
  "/planning/v3/news/alerts",
  "/planning/v3/news/explore",
  "/planning/v3/news/settings",
  "/planning/v3/news/trends",
  "/planning/v3/profile/draft",
  "/planning/v3/profile/drafts/[id]",
  "/planning/v3/profile/drafts/[id]/preflight",
  "/planning/v3/scenarios",
  "/planning/v3/start",
  "/planning/v3/transactions/batches/[id]",
] as const;

const OPS_PAGE_PATTERNS = [
  "/ops",
  "/ops/about",
  "/ops/assumptions",
  "/ops/assumptions/history",
  "/ops/audit",
  "/ops/auto-merge",
  "/ops/auto-merge/policy",
  "/ops/backup",
  "/ops/doctor",
  "/ops/feedback/planning",
  "/ops/labels",
  "/ops/metrics",
  "/ops/planning",
  "/ops/planning-cache",
  "/ops/planning-cleanup",
  "/ops/planning-eval",
  "/ops/rules",
  "/ops/runs",
  "/ops/security",
  "/ops/support",
] as const;

const DEV_PAGE_PATTERNS = [
  "/dashboard/artifacts",
  "/debug/planning-v2",
  "/debug/unified",
  "/dev/data",
  "/dev/finlife/schema",
  "/dev/git",
  "/dev/public-apis",
] as const;

const REDIRECT_ROUTE_POLICIES: RedirectRoutePolicyEntry[] = [
  {
    pattern: "/compare",
    kind: "redirect",
    canonicalHref: "/products/compare",
    visibility: "public-stable",
    status: "stable",
  },
  {
    pattern: "/products/deposit",
    kind: "redirect",
    canonicalHref: "/products/catalog?kind=deposit",
    visibility: "public-stable",
    status: "stable",
  },
  {
    pattern: "/products/saving",
    kind: "redirect",
    canonicalHref: "/products/catalog?kind=saving",
    visibility: "public-stable",
    status: "stable",
  },
  {
    pattern: "/planning/v3/transactions",
    kind: "redirect",
    canonicalHref: "/planning/v3/transactions/batches",
    visibility: "public-beta",
    status: "official-beta-entry",
  },
  {
    pattern: "/report",
    kind: "redirect",
    canonicalHref: "/planning/reports",
    visibility: "legacy",
    status: "legacy-redirect",
  },
  {
    pattern: "/planner",
    kind: "redirect",
    canonicalHref: "/planning",
    visibility: "legacy",
    status: "legacy-redirect",
  },
  {
    pattern: "/planner/[...slug]",
    kind: "redirect",
    canonicalHref: "/planning",
    visibility: "legacy",
    status: "legacy-redirect",
  },
];

function createPageRoutePolicies(
  patterns: readonly string[],
  visibility: RouteVisibility,
  status: RouteStatus,
): PageRoutePolicyEntry[] {
  return patterns.map((pattern) => ({ pattern, kind: "page", visibility, status }));
}

export const ROUTE_POLICY_REGISTRY: RoutePolicyEntry[] = [
  ...createPageRoutePolicies(PUBLIC_STABLE_PAGE_PATTERNS, "public-stable", "stable"),
  ...createPageRoutePolicies(PUBLIC_BETA_PAGE_PATTERNS, "public-beta", "beta"),
  ...createPageRoutePolicies(OFFICIAL_BETA_PAGE_PATTERNS, "public-beta", "official-beta-entry"),
  ...createPageRoutePolicies(INTERNAL_PAGE_PATTERNS, "internal", "internal"),
  ...createPageRoutePolicies(OPS_PAGE_PATTERNS, "ops", "ops"),
  ...createPageRoutePolicies(DEV_PAGE_PATTERNS, "dev", "dev-debug"),
  ...REDIRECT_ROUTE_POLICIES,
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

export function isRoutePatternMatch(pathname: string, pattern: string): boolean {
  const pathSegments = normalizeRoutePath(pathname).split("/").filter(Boolean);
  const patternSegments = normalizeRoutePath(pattern).split("/").filter(Boolean);

  for (let index = 0; index < patternSegments.length; index += 1) {
    const patternSegment = patternSegments[index];
    const isLastSegment = index === patternSegments.length - 1;
    if (patternSegment.startsWith("[[...") && patternSegment.endsWith("]]")) {
      return isLastSegment;
    }
    if (patternSegment.startsWith("[...") && patternSegment.endsWith("]")) {
      return isLastSegment && pathSegments.length > index;
    }
    if (index >= pathSegments.length) return false;
    if (patternSegment.startsWith("[") && patternSegment.endsWith("]")) continue;
    if (pathSegments[index] !== patternSegment) return false;
  }

  return pathSegments.length === patternSegments.length;
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

export function resolveRouteVisibility(pathname: string): ResolvedRoutePolicy {
  const normalizedPathname = normalizeRoutePath(pathname);
  const exactMatch = ROUTE_POLICY_REGISTRY.find(
    (entry) => !entry.pattern.includes("[") && normalizeRoutePath(entry.pattern) === normalizedPathname,
  );
  const policyMatch = exactMatch ?? ROUTE_POLICY_REGISTRY.find(
    (entry) => entry.pattern.includes("[") && isRoutePatternMatch(normalizedPathname, entry.pattern),
  );

  if (policyMatch) {
    return {
      id: policyMatch.pattern === "/" ? "route:root" : `route:${policyMatch.pattern}`,
      href: policyMatch.pattern,
      kind: policyMatch.kind,
      ...(policyMatch.kind === "redirect" ? { canonicalHref: policyMatch.canonicalHref } : {}),
      visibility: policyMatch.visibility,
      status: policyMatch.status,
    };
  }

  return {
    id: "unknown-route",
    href: normalizedPathname,
    kind: "unknown",
    visibility: "internal",
    status: "unknown",
  };
}

export function isExplicitPageRoute(pathname: string): boolean {
  return resolveRouteVisibility(pathname).kind === "page";
}

export function isOpsOrDevRoute(pathname: string): boolean {
  return NAVIGATION_ROUTE_REGISTRY.some(
    (item) => (item.visibility === "ops" || item.visibility === "dev") && isNavigationItemActive(pathname, item),
  );
}
