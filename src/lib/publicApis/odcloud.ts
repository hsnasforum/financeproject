import { type PublicApiError, type PublicApiErrorCode } from "./contracts/types";

export function encodeServiceKey(key: string): string {
  const value = key.trim();
  if (/%[0-9a-fA-F]{2}/.test(value)) return value;
  return encodeURIComponent(value);
}

export function appendServiceKey(url: URL, key: string, paramName = "serviceKey"): void {
  const encodedKey = encodeServiceKey(key);
  const sep = url.search ? "&" : "?";
  url.search += `${sep}${encodeURIComponent(paramName)}=${encodedKey}`;
}

export function setSearchParams(
  url: URL,
  params: Record<string, string | number | undefined>,
): void {
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    const text = String(value).trim();
    if (!text) continue;
    url.searchParams.set(key, text);
  }
}

type ResolverOk = {
  ok: true;
  url: URL;
  resolvedFrom: "full" | "base" | "dir";
  baseOriginPath: string;
  endpointPath: string;
};

type ResolverErr = {
  ok: false;
  error: PublicApiError;
};

function normalizePath(pathname: string): string {
  const path = pathname.trim();
  if (!path) return "/";
  return path === "/" ? "/" : path.replace(/\/+$/, "");
}

function normalizeDefaultPath(defaultPath: string): string {
  const base = defaultPath.trim();
  if (!base) return "/";
  const withLeading = base.startsWith("/") ? base : `/${base}`;
  if (withLeading === "/api") return "/";
  if (withLeading.startsWith("/api/")) return withLeading.slice(4);
  return withLeading;
}

function joinPath(basePath: string, suffixPath: string): string {
  const base = normalizePath(basePath);
  const suffix = normalizePath(suffixPath);
  if (suffix === "/") return base;
  return `${base}/${suffix.replace(/^\/+/, "")}`.replace(/\/{2,}/g, "/");
}

export function stripQuery(rawUrl: string): string {
  const parsed = new URL(rawUrl);
  return `${parsed.origin}${normalizePath(parsed.pathname)}`;
}

export function isDocUrl(u: URL): boolean {
  const host = u.host.toLowerCase();
  const path = u.pathname.toLowerCase();
  return host.includes("infuser.odcloud.kr") || path.includes("api-docs");
}

export function resolveOdcloudEndpoint(
  rawEnvUrl: string,
  defaultPath: string,
  opts?: { allowBaseOnly?: boolean; allowDirOnly?: boolean },
): ResolverOk | ResolverErr {
  const input = (rawEnvUrl ?? "").trim();
  if (!input) {
    return {
      ok: false,
      error: { code: "ENV_MISSING" as PublicApiErrorCode, message: "ODcloud API URL 설정이 필요합니다." },
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return {
      ok: false,
      error: { code: "ENV_INVALID_URL" as PublicApiErrorCode, message: "URL 형식이 올바르지 않습니다." },
    };
  }

  if (!/^https:$/i.test(parsed.protocol)) {
    return {
      ok: false,
      error: { code: "ENV_INVALID_URL" as PublicApiErrorCode, message: "URL은 https://로 시작해야 합니다." },
    };
  }

  if (isDocUrl(parsed)) {
    return {
      ok: false,
      error: {
        code: "ENV_DOC_URL" as PublicApiErrorCode,
        message:
          "api-docs는 문서 URL입니다. 호출 URL은 https://api.odcloud.kr/api/... 형태를 사용하세요.",
      },
    };
  }

  const stripped = new URL(stripQuery(parsed.toString()));
  const normalizedPath = normalizePath(stripped.pathname);
  const defaultNormalized = normalizeDefaultPath(defaultPath);
  const defaultSegments = defaultNormalized.split("/").filter(Boolean);
  const defaultLastSegment = defaultSegments[defaultSegments.length - 1] ?? "";

  if ((normalizedPath === "/api" || normalizedPath === "/api/") && opts?.allowBaseOnly) {
    const endpointPath = joinPath("/api", defaultNormalized);
    const url = new URL(stripped.origin);
    url.pathname = endpointPath;
    return {
      ok: true,
      url,
      resolvedFrom: "base",
      baseOriginPath: `${stripped.origin}/api`,
      endpointPath,
    };
  }

  if (normalizedPath.startsWith("/api/")) {
    const pathSegments = normalizedPath.split("/").filter(Boolean);
    const currentLast = pathSegments[pathSegments.length - 1] ?? "";

    if (defaultLastSegment && currentLast === defaultLastSegment) {
      return {
        ok: true,
        url: stripped,
        resolvedFrom: "full",
        baseOriginPath: `${stripped.origin}${normalizedPath}`,
        endpointPath: normalizedPath,
      };
    }

    if (opts?.allowDirOnly && defaultLastSegment) {
      const endpointPath = joinPath(normalizedPath, `/${defaultLastSegment}`);
      const url = new URL(stripped.origin);
      url.pathname = endpointPath;
      return {
        ok: true,
        url,
        resolvedFrom: "dir",
        baseOriginPath: `${stripped.origin}${normalizedPath}`,
        endpointPath,
      };
    }
  }

  return {
    ok: true,
    url: stripped,
    resolvedFrom: "full",
    baseOriginPath: `${stripped.origin}${normalizedPath}`,
    endpointPath: normalizedPath,
  };
}

function looksLikeAuthError(status: number, text: string): boolean {
  if (status === 401 || status === 403) return true;
  if (status >= 200 && status < 300) return false;
  const body = text.toLowerCase();
  if (!body) return false;
  return (
    body.includes("service_key") ||
    body.includes("servicekey") ||
    body.includes("service key") ||
    body.includes("key is not registered") ||
    body.includes("not authorized")
  );
}

export async function odcloudFetchWithAuth(
  url: URL,
  key: string,
  init?: RequestInit,
  opts?: { allowServiceKeyFallback?: boolean },
): Promise<{ response: Response; authMode: "query" | "header-fallback" }> {
  const allowFallback = opts?.allowServiceKeyFallback !== false;
  const queryUrl = new URL(url.toString());
  appendServiceKey(queryUrl, key);
  const first = await fetch(queryUrl.toString(), {
    ...(init ?? {}),
    cache: "no-store",
  });
  if (!allowFallback) return { response: first, authMode: "query" };

  const preview = (await first.clone().text()).slice(0, 2048);
  if (!looksLikeAuthError(first.status, preview)) {
    return { response: first, authMode: "query" };
  }

  const fallbackUrl = new URL(url.toString());
  const secondHeaders = new Headers(init?.headers ?? {});
  const decodedKey = (() => {
    try {
      return decodeURIComponent(key);
    } catch {
      return key;
    }
  })();
  secondHeaders.set("Authorization", decodedKey);
  const second = await fetch(fallbackUrl.toString(), {
    ...(init ?? {}),
    headers: secondHeaders,
    cache: "no-store",
  });
  if (!looksLikeAuthError(second.status, (await second.clone().text()).slice(0, 2048))) {
    return { response: second, authMode: "header-fallback" };
  }

  if (decodedKey !== key) {
    const thirdHeaders = new Headers(init?.headers ?? {});
    thirdHeaders.set("Authorization", key);
    const third = await fetch(fallbackUrl.toString(), {
      ...(init ?? {}),
      headers: thirdHeaders,
      cache: "no-store",
    });
    return { response: third, authMode: "header-fallback" };
  }

  return { response: second, authMode: "header-fallback" };
}
