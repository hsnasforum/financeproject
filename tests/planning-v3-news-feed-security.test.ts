import path from "node:path";
import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import {
  fetchFeed,
  validateFeedUrlSyntax,
  type FeedLookup,
} from "../src/lib/planning/v3/news/ingest/fetchFeed";
import { previewImportNewsSources } from "../src/lib/planning/v3/news/sourceTransfer";

const PUBLIC_LOOKUP: FeedLookup = async () => [{ address: "93.184.216.34", family: 4 }];

function createHttpsRequestMock(options: {
  body: string;
  headers?: Record<string, string>;
  status?: number;
}) {
  const requestSpy = vi.fn((
    _url: URL,
    _requestOptions: unknown,
    onResponse: (incoming: PassThrough & {
      statusCode: number;
      statusMessage: string;
      headers: Record<string, string>;
    }) => void,
  ) => {
    const incoming = Object.assign(new PassThrough(), {
      statusCode: options.status ?? 200,
      statusMessage: "OK",
      headers: options.headers ?? { "content-type": "application/rss+xml" },
    });
    queueMicrotask(() => {
      onResponse(incoming);
      incoming.end(options.body);
    });
    const request = {
      once: vi.fn(),
      end: vi.fn(),
    };
    request.once.mockReturnValue(request);
    return request;
  });
  return requestSpy;
}

describe("planning v3 news feed security", () => {
  it.each([
    ["http://feeds.example.com/rss", "HTTPS_REQUIRED"],
    ["https://user:secret@feeds.example.com/rss", "CREDENTIALS_FORBIDDEN"],
    ["https://localhost/rss", "HOST_FORBIDDEN"],
    ["https://metadata.google.internal/rss", "HOST_FORBIDDEN"],
    ["https://127.0.0.1/rss", "ADDRESS_FORBIDDEN"],
    ["https://169.254.169.254/latest/meta-data", "ADDRESS_FORBIDDEN"],
    ["https://10.0.0.1/rss", "ADDRESS_FORBIDDEN"],
    ["https://[::1]/rss", "ADDRESS_FORBIDDEN"],
    ["https://[::ffff:127.0.0.1]/rss", "ADDRESS_FORBIDDEN"],
    ["https://[::ffff:0:7f00:1]/rss", "ADDRESS_FORBIDDEN"],
    ["https://[fd00:ec2::254]/rss", "ADDRESS_FORBIDDEN"],
    ["https://[64:ff9b::7f00:1]/rss", "ADDRESS_FORBIDDEN"],
    ["https://[2002:7f00:1::]/rss", "ADDRESS_FORBIDDEN"],
  ])("rejects unsafe feed URL %s", (url, code) => {
    expect(validateFeedUrlSyntax(url)).toEqual({ ok: false, code });
  });

  it("rejects unsafe custom sources during import preview", () => {
    const preview = previewImportNewsSources([
      { url: "https://feeds.example.com/rss", weight: 1, enabled: true },
      { url: "http://feeds.example.com/rss", weight: 1, enabled: true },
      { url: "https://127.0.0.1/rss", weight: 1, enabled: true },
      { url: "https://user:secret@feeds.example.com/rss", weight: 1, enabled: true },
    ], {
      rootDir: path.join(process.cwd(), "tmp", "news-feed-security-import"),
    });

    expect(preview.validRows).toBe(1);
    expect(preview.createCount).toBe(1);
    expect(preview.issueCount).toBe(3);
    expect(preview.issues.map((issue) => issue.index)).toEqual([1, 2, 3]);
  });

  it("fetches an XML feed only after a public DNS result", async () => {
    const fetchMock = vi.fn(async () => new Response("<rss><channel /></rss>", {
      status: 200,
      headers: { "content-type": "application/rss+xml; charset=utf-8" },
    }));

    const result = await fetchFeed({
      feedUrl: "https://feeds.example.com/rss",
      fetchImpl: fetchMock as unknown as typeof fetch,
      lookupImpl: PUBLIC_LOOKUP,
    });

    expect(result).toMatchObject({ ok: true, status: 200, notModified: false });
    expect(result.xml).toBe("<rss><channel /></rss>");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://feeds.example.com/rss",
      expect.objectContaining({ redirect: "manual" }),
    );
  });

  it("pins the validated address, requests identity encoding, and accepts plain XML", async () => {
    const requestSpy = createHttpsRequestMock({
      body: "<rss><channel /></rss>",
      headers: { "content-type": "application/rss+xml" },
    });

    const result = await fetchFeed({
      feedUrl: "https://feeds.example.com/rss",
      httpsRequestImpl: requestSpy as unknown as typeof import("node:https").request,
      lookupImpl: PUBLIC_LOOKUP,
    });

    expect(result).toMatchObject({ ok: true, status: 200, notModified: false });
    expect(result.xml).toBe("<rss><channel /></rss>");
    expect(requestSpy).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        headers: expect.objectContaining({ "accept-encoding": "identity" }),
        lookup: expect.any(Function),
      }),
      expect.any(Function),
    );
  });

  it("rejects compressed bodies on the pinned HTTPS transport", async () => {
    const requestSpy = createHttpsRequestMock({
      body: "",
      headers: {
        "content-type": "application/rss+xml",
        "content-encoding": "gzip",
      },
    });

    const result = await fetchFeed({
      feedUrl: "https://feeds.example.com/rss",
      httpsRequestImpl: requestSpy as unknown as typeof import("node:https").request,
      lookupImpl: PUBLIC_LOOKUP,
    });

    expect(result.error).toBe("unsupported_content_encoding");
  });

  it("blocks private or mixed DNS answers before fetch", async () => {
    const fetchMock = vi.fn();
    const result = await fetchFeed({
      feedUrl: "https://feeds.example.com/rss",
      fetchImpl: fetchMock as unknown as typeof fetch,
      lookupImpl: async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "10.0.0.5", family: 4 },
      ],
    });

    expect(result).toEqual({
      ok: false,
      status: 0,
      notModified: false,
      error: "unsafe_feed_url:ADDRESS_FORBIDDEN",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks an IPv4-translatable private address returned by DNS", async () => {
    const fetchMock = vi.fn();
    const result = await fetchFeed({
      feedUrl: "https://feeds.example.com/rss",
      fetchImpl: fetchMock as unknown as typeof fetch,
      lookupImpl: async () => [{ address: "::ffff:0:7f00:1", family: 6 }],
    });

    expect(result.error).toBe("unsafe_feed_url:ADDRESS_FORBIDDEN");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("revalidates every redirect hop and blocks a private redirect target", async () => {
    const fetchMock = vi.fn(async () => new Response(null, {
      status: 302,
      headers: { location: "https://internal.example/rss" },
    }));
    const lookupMock = vi.fn<FeedLookup>(async (hostname) => hostname === "internal.example"
      ? [{ address: "192.168.10.5", family: 4 }]
      : [{ address: "93.184.216.34", family: 4 }]);

    const result = await fetchFeed({
      feedUrl: "https://feeds.example.com/rss",
      fetchImpl: fetchMock as unknown as typeof fetch,
      lookupImpl: lookupMock,
    });

    expect(result.error).toBe("unsafe_feed_url:ADDRESS_FORBIDDEN");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(lookupMock).toHaveBeenCalledTimes(2);
  });

  it("rejects non-XML and oversized successful responses", async () => {
    const htmlResult = await fetchFeed({
      feedUrl: "https://feeds.example.com/rss",
      lookupImpl: PUBLIC_LOOKUP,
      fetchImpl: (async () => new Response("<html></html>", {
        headers: { "content-type": "text/html" },
      })) as typeof fetch,
    });
    expect(htmlResult.error).toBe("invalid_content_type");

    const oversizedResult = await fetchFeed({
      feedUrl: "https://feeds.example.com/rss",
      lookupImpl: PUBLIC_LOOKUP,
      maxResponseBytes: 1_024,
      fetchImpl: (async () => new Response("x".repeat(1_025), {
        headers: { "content-type": "application/xml" },
      })) as typeof fetch,
    });
    expect(oversizedResult.error).toBe("response_too_large");
  });
});
