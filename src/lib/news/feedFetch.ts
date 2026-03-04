import { fetchExternal } from "../http/fetchExternal.ts";
import { type NewsFeedConfig } from "./types.ts";

export type FeedFetchResult = {
  ok: boolean;
  feedId: string;
  status?: number;
  xml?: string;
  message?: string;
};

export async function fetchFeedXml(feed: NewsFeedConfig): Promise<FeedFetchResult> {
  try {
    const fetched = await fetchExternal(feed.url, {
      timeoutMs: 12_000,
      retries: 1,
      sourceKey: `news:${feed.id}`,
      throwOnHttpError: false,
      retryOn: [429, 500, 502, 503, 504],
    });

    if (!fetched.ok) {
      return {
        ok: false,
        feedId: feed.id,
        status: fetched.status,
        message: `upstream status ${fetched.status}`,
      };
    }

    const text = String(fetched.text ?? "").trim();
    if (!text) {
      return {
        ok: false,
        feedId: feed.id,
        status: fetched.status,
        message: "empty response body",
      };
    }

    return {
      ok: true,
      feedId: feed.id,
      status: fetched.status,
      xml: text,
    };
  } catch (error) {
    return {
      ok: false,
      feedId: feed.id,
      message: error instanceof Error ? error.message : "fetch failed",
    };
  }
}
