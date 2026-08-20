import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { Readable } from "node:stream";
import { clampRoundedInteger } from "../../../calc/roundingPolicy";

const DEFAULT_MAX_RESPONSE_BYTES = 2_000_000;
const DEFAULT_MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const XML_CONTENT_TYPES = new Set([
  "application/atom+xml",
  "application/rdf+xml",
  "application/rss+xml",
  "application/xml",
  "text/xml",
]);

export type FeedLookupAddress = {
  address: string;
  family: number;
};

export type FeedLookup = (hostname: string) => Promise<FeedLookupAddress[]>;

export type FeedUrlValidation =
  | { ok: true; url: URL }
  | { ok: false; code: string };

type ResolvedFeedUrlValidation =
  | { ok: true; url: URL; addresses: FeedLookupAddress[] }
  | { ok: false; code: string };

export type FetchFeedInput = {
  feedUrl: string;
  etag?: string;
  lastModified?: string;
  fetchImpl?: typeof fetch;
  httpsRequestImpl?: typeof httpsRequest;
  lookupImpl?: FeedLookup;
  timeoutMs?: number;
  maxRedirects?: number;
  maxResponseBytes?: number;
};

export type FetchFeedResult = {
  ok: boolean;
  status: number;
  notModified: boolean;
  xml?: string;
  etag?: string;
  lastModified?: string;
  error?: string;
};

function normalizeHostname(hostname: string): string {
  const lowered = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (lowered.startsWith("[") && lowered.endsWith("]")) {
    return lowered.slice(1, -1);
  }
  return lowered;
}

function isBlockedHostname(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  return normalized === "localhost"
    || normalized.endsWith(".localhost")
    || normalized === "metadata"
    || normalized === "metadata.google.internal"
    || normalized.endsWith(".internal")
    || normalized.endsWith(".local")
    || normalized.endsWith(".lan")
    || normalized.endsWith(".home");
}

function parseIpv4(address: string): number[] | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map((part) => Number(part));
  if (octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return null;
  return octets;
}

function isBlockedIpv4(address: string): boolean {
  const octets = parseIpv4(address);
  if (!octets) return true;
  const [a, b, c] = octets;
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 0 && c === 0)
    || (a === 192 && b === 0 && c === 2)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19))
    || (a === 198 && b === 51 && c === 100)
    || (a === 203 && b === 0 && c === 113)
    || a >= 224;
}

function expandIpv6(address: string): number[] | null {
  const normalized = address.toLowerCase().split("%")[0];
  if (!normalized) return null;

  let value = normalized;
  const ipv4Match = value.match(/(?:^|:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (ipv4Match) {
    const octets = parseIpv4(ipv4Match[1]);
    if (!octets) return null;
    const ipv4Words = [
      ((octets[0] << 8) | octets[1]).toString(16),
      ((octets[2] << 8) | octets[3]).toString(16),
    ];
    value = `${value.slice(0, value.length - ipv4Match[1].length)}${ipv4Words.join(":")}`;
  }

  const doubleColonParts = value.split("::");
  if (doubleColonParts.length > 2) return null;
  const left = doubleColonParts[0] ? doubleColonParts[0].split(":") : [];
  const right = doubleColonParts.length === 2 && doubleColonParts[1]
    ? doubleColonParts[1].split(":")
    : [];
  const fillCount = 8 - left.length - right.length;
  if ((doubleColonParts.length === 1 && fillCount !== 0) || fillCount < 0) return null;
  const words = [
    ...left,
    ...Array.from({ length: fillCount }, () => "0"),
    ...right,
  ].map((part) => Number.parseInt(part || "0", 16));
  if (words.length !== 8 || words.some((word) => !Number.isInteger(word) || word < 0 || word > 0xffff)) {
    return null;
  }
  return words;
}

function isBlockedIpv6(address: string): boolean {
  const words = expandIpv6(address);
  if (!words) return true;

  const isIpv4Mapped = words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff;
  const isIpv4Translatable = words.slice(0, 4).every((word) => word === 0)
    && words[4] === 0xffff
    && words[5] === 0;
  if (isIpv4Mapped || isIpv4Translatable) {
    const embedded = `${words[6] >> 8}.${words[6] & 0xff}.${words[7] >> 8}.${words[7] & 0xff}`;
    return isBlockedIpv4(embedded);
  }

  const isUnspecified = words.every((word) => word === 0);
  const isLoopback = words.slice(0, 7).every((word) => word === 0) && words[7] === 1;
  const isIpv4Compatible = words.slice(0, 6).every((word) => word === 0) && !isUnspecified && !isLoopback;
  const isNat64 = words[0] === 0x0064 && words[1] === 0xff9b;
  return isUnspecified
    || isLoopback
    || isIpv4Compatible
    || isNat64
    || (words[0] & 0xfe00) === 0xfc00
    || (words[0] & 0xffc0) === 0xfe80
    || (words[0] & 0xffc0) === 0xfec0
    || (words[0] & 0xff00) === 0xff00
    || (words[0] === 0x2001 && words[1] === 0x0000)
    || (words[0] === 0x2001 && words[1] === 0x0db8)
    || words[0] === 0x2002;
}

function isBlockedIp(address: string): boolean {
  const normalized = normalizeHostname(address);
  const family = isIP(normalized);
  if (family === 4) return isBlockedIpv4(normalized);
  if (family === 6) return isBlockedIpv6(normalized);
  return true;
}

export function validateFeedUrlSyntax(input: string): FeedUrlValidation {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return { ok: false, code: "INVALID_URL" };
  }

  if (url.protocol !== "https:") return { ok: false, code: "HTTPS_REQUIRED" };
  if (url.username || url.password) return { ok: false, code: "CREDENTIALS_FORBIDDEN" };
  if (!url.hostname || isBlockedHostname(url.hostname)) return { ok: false, code: "HOST_FORBIDDEN" };
  const hostname = normalizeHostname(url.hostname);
  if (isIP(hostname) !== 0 && isBlockedIp(hostname)) return { ok: false, code: "ADDRESS_FORBIDDEN" };
  return { ok: true, url };
}

async function defaultLookup(hostname: string): Promise<FeedLookupAddress[]> {
  return await dnsLookup(hostname, { all: true, verbatim: true });
}

async function validateResolvedFeedUrl(input: string, lookupImpl: FeedLookup): Promise<ResolvedFeedUrlValidation> {
  const syntax = validateFeedUrlSyntax(input);
  if (!syntax.ok) return syntax;

  const hostname = normalizeHostname(syntax.url.hostname);
  const literalFamily = isIP(hostname);
  if (literalFamily !== 0) {
    return {
      ok: true,
      url: syntax.url,
      addresses: [{ address: hostname, family: literalFamily }],
    };
  }

  let addresses: FeedLookupAddress[];
  try {
    addresses = await lookupImpl(hostname);
  } catch {
    return { ok: false, code: "DNS_LOOKUP_FAILED" };
  }
  if (addresses.length < 1) return { ok: false, code: "DNS_LOOKUP_FAILED" };
  if (addresses.some((entry) => isIP(normalizeHostname(entry.address)) === 0 || isBlockedIp(entry.address))) {
    return { ok: false, code: "ADDRESS_FORBIDDEN" };
  }
  return { ok: true, url: syntax.url, addresses };
}

function createPinnedLookup(addresses: FeedLookupAddress[]): LookupFunction {
  return (_hostname, options, callback) => {
    if (options.all) {
      callback(null, addresses.map((entry) => ({ address: entry.address, family: entry.family })));
      return;
    }
    const requestedFamily = Number(options.family);
    const selected = requestedFamily === 4 || requestedFamily === 6
      ? addresses.find((entry) => entry.family === requestedFamily)
      : addresses[0];
    if (!selected) {
      const error = new Error("No validated address for requested family") as NodeJS.ErrnoException;
      error.code = "ENOTFOUND";
      callback(error, "", 0);
      return;
    }
    callback(null, selected.address, selected.family);
  };
}

function pinnedHttpsFetch(
  url: URL,
  init: { headers: Headers; signal: AbortSignal },
  addresses: FeedLookupAddress[],
  requestImpl: typeof httpsRequest,
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const request = requestImpl(url, {
      method: "GET",
      headers: Object.fromEntries(init.headers.entries()),
      signal: init.signal,
      lookup: createPinnedLookup(addresses),
    }, (incoming) => {
      const status = incoming.statusCode ?? 0;
      const responseHeaders = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (Array.isArray(value)) {
          for (const item of value) responseHeaders.append(name, item);
        } else if (typeof value === "string") {
          responseHeaders.set(name, value);
        }
      }

      const bodyAllowed = status !== 101 && status !== 204 && status !== 205 && status !== 304;
      if (!bodyAllowed) incoming.resume();
      const body = bodyAllowed
        ? Readable.toWeb(incoming) as ReadableStream<Uint8Array>
        : null;
      resolve(new Response(body, {
        status,
        statusText: incoming.statusMessage,
        headers: responseHeaders,
      }));
    });
    request.once("error", reject);
    request.end();
  });
}

async function readBodyWithLimit(response: Response, maxBytes: number): Promise<string | null> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let text = "";
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    bytesRead += chunk.value.byteLength;
    if (bytesRead > maxBytes) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(chunk.value, { stream: true });
  }
  text += decoder.decode();
  return text.trim();
}

export async function fetchFeed(input: FetchFeedInput): Promise<FetchFeedResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const lookupImpl = input.lookupImpl ?? defaultLookup;
  const timeoutMs = clampRoundedInteger(input.timeoutMs ?? 12_000, 1_000, Number.MAX_SAFE_INTEGER, 12_000);
  const maxRedirects = clampRoundedInteger(input.maxRedirects ?? DEFAULT_MAX_REDIRECTS, 0, 10, DEFAULT_MAX_REDIRECTS);
  const maxResponseBytes = clampRoundedInteger(
    input.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES,
    1_024,
    5_000_000,
    DEFAULT_MAX_RESPONSE_BYTES,
  );

  const headers = new Headers();
  headers.set("accept", "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9");
  headers.set("accept-encoding", "identity");
  headers.set("user-agent", "finance-news-ingest/1.0");
  if (input.etag) headers.set("if-none-match", input.etag);
  if (input.lastModified) headers.set("if-modified-since", input.lastModified);

  const abortController = new AbortController();
  const timer = setTimeout(() => abortController.abort(), timeoutMs);

  try {
    let currentUrl = input.feedUrl;
    for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
      const validated = await validateResolvedFeedUrl(currentUrl, lookupImpl);
      if (!validated.ok) {
        return {
          ok: false,
          status: 0,
          notModified: false,
          error: `unsafe_feed_url:${validated.code}`,
        };
      }

      const response = input.fetchImpl
        ? await fetchImpl(validated.url.toString(), {
          method: "GET",
          headers,
          signal: abortController.signal,
          redirect: "manual",
        })
        : await pinnedHttpsFetch(validated.url, {
          headers,
          signal: abortController.signal,
        }, validated.addresses, input.httpsRequestImpl ?? httpsRequest);

      const status = response.status;
      const etag = response.headers.get("etag") ?? undefined;
      const lastModified = response.headers.get("last-modified") ?? undefined;

      if (REDIRECT_STATUSES.has(status)) {
        const location = response.headers.get("location");
        await response.body?.cancel();
        if (!location) {
          return { ok: false, status, notModified: false, error: "redirect_without_location" };
        }
        if (redirectCount >= maxRedirects) {
          return { ok: false, status, notModified: false, error: "too_many_redirects" };
        }
        try {
          currentUrl = new URL(location, validated.url).toString();
        } catch {
          return { ok: false, status, notModified: false, error: "invalid_redirect_url" };
        }
        continue;
      }

      if (status === 304) {
        return {
          ok: true,
          status,
          notModified: true,
          etag,
          lastModified,
        };
      }

      if (!response.ok) {
        await response.body?.cancel();
        return {
          ok: false,
          status,
          notModified: false,
          etag,
          lastModified,
          error: `HTTP ${status}`,
        };
      }

      const contentEncoding = (response.headers.get("content-encoding") ?? "").trim().toLowerCase();
      if (contentEncoding && contentEncoding !== "identity") {
        await response.body?.cancel();
        return {
          ok: false,
          status,
          notModified: false,
          etag,
          lastModified,
          error: "unsupported_content_encoding",
        };
      }

      const contentType = (response.headers.get("content-type") ?? "").split(";", 1)[0].trim().toLowerCase();
      if (!XML_CONTENT_TYPES.has(contentType)) {
        await response.body?.cancel();
        return {
          ok: false,
          status,
          notModified: false,
          etag,
          lastModified,
          error: "invalid_content_type",
        };
      }

      const contentLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(contentLength) && contentLength > maxResponseBytes) {
        await response.body?.cancel();
        return {
          ok: false,
          status,
          notModified: false,
          etag,
          lastModified,
          error: "response_too_large",
        };
      }

      const xml = await readBodyWithLimit(response, maxResponseBytes);
      if (xml === null) {
        return {
          ok: false,
          status,
          notModified: false,
          etag,
          lastModified,
          error: "response_too_large",
        };
      }
      if (!xml) {
        return {
          ok: false,
          status,
          notModified: false,
          etag,
          lastModified,
          error: "empty_response",
        };
      }

      return {
        ok: true,
        status,
        notModified: false,
        xml,
        etag,
        lastModified,
      };
    }

    return { ok: false, status: 0, notModified: false, error: "too_many_redirects" };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      notModified: false,
      error: abortController.signal.aborted
        ? "fetch_timeout"
        : error instanceof Error ? error.message : "fetch_failed",
    };
  } finally {
    clearTimeout(timer);
  }
}
