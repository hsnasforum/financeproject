export type FetchFeedInput = {
  feedUrl: string;
  etag?: string;
  lastModified?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
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

export async function fetchFeed(input: FetchFeedInput): Promise<FetchFeedResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const timeoutMs = Math.max(1_000, Math.round(input.timeoutMs ?? 12_000));

  const headers = new Headers();
  headers.set("accept", "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.1");
  headers.set("user-agent", "finance-news-ingest/1.0");
  if (input.etag) headers.set("if-none-match", input.etag);
  if (input.lastModified) headers.set("if-modified-since", input.lastModified);

  const abortController = new AbortController();
  const timer = setTimeout(() => abortController.abort(), timeoutMs);

  try {
    const response = await fetchImpl(input.feedUrl, {
      method: "GET",
      headers,
      signal: abortController.signal,
    });

    const status = response.status;
    const etag = response.headers.get("etag") ?? undefined;
    const lastModified = response.headers.get("last-modified") ?? undefined;

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
      return {
        ok: false,
        status,
        notModified: false,
        etag,
        lastModified,
        error: `HTTP ${status}`,
      };
    }

    const xml = (await response.text()).trim();
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
  } catch (error) {
    return {
      ok: false,
      status: 0,
      notModified: false,
      error: error instanceof Error ? error.message : "fetch_failed",
    };
  } finally {
    clearTimeout(timer);
  }
}
