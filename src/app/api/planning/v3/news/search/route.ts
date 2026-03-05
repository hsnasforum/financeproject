import { NextResponse } from "next/server";
import { z } from "zod";
import { assertLocalHost, toGuardErrorResponse } from "@/lib/dev/devGuards";
import { onlyDev } from "@/lib/dev/onlyDev";
import { readNewsTopicTrends } from "@/lib/news/trendReader";
import { readNewsSearchIndex, searchNewsIndex, writeNewsSearchIndex, type NewsSearchFilters } from "@/lib/news/searchIndex";
import { parseWithV3Whitelist } from "../../../../../../../planning/v3/security/whitelist";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toList(value: string | null): string[] {
  if (!value) return [];
  return [...new Set(value.split(",").map((row) => row.trim().toLowerCase()).filter(Boolean))];
}

function withReadGuard(request: Request): Response | null {
  try {
    assertLocalHost(request);
    return null;
  } catch (error) {
    const guard = toGuardErrorResponse(error);
    if (!guard) {
      return NextResponse.json(
        { ok: false, error: { code: "INTERNAL", message: "요청 검증 중 오류가 발생했습니다." } },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: guard.code, message: guard.message } },
      { status: guard.status },
    );
  }
}

function normalizeFilters(url: URL): NewsSearchFilters & { burst: "all" | "상" | "중" | "하" } {
  const q = asString(url.searchParams.get("q"));
  const topics = [
    ...toList(url.searchParams.get("topics")),
    ...toList(url.searchParams.get("topic")),
  ];
  const sources = [
    ...toList(url.searchParams.get("sources")),
    ...toList(url.searchParams.get("source")),
  ];
  const dateFrom = asString(url.searchParams.get("dateFrom")) || undefined;
  const dateTo = asString(url.searchParams.get("dateTo")) || undefined;
  const days = Math.max(1, Math.min(365, Math.round(asNumber(url.searchParams.get("days"), 30))));
  const minScore = asNumber(url.searchParams.get("minScore"), Number.NEGATIVE_INFINITY);
  const limit = Math.max(1, Math.min(200, Math.round(asNumber(url.searchParams.get("limit"), 100))));
  const offset = Math.max(0, Math.round(asNumber(url.searchParams.get("offset"), 0)));
  const burstRaw = asString(url.searchParams.get("burst"));
  const burst = burstRaw === "상" || burstRaw === "중" || burstRaw === "하" ? burstRaw : "all";
  return {
    q,
    topics,
    sources,
    dateFrom,
    dateTo,
    days,
    minScore,
    limit,
    offset,
    burst,
  };
}

const SearchResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    generatedAt: z.string().datetime(),
    indexGeneratedAt: z.string().datetime(),
    total: z.number().int().nonnegative(),
    filters: z.object({
      q: z.string(),
      topics: z.array(z.string()),
      sources: z.array(z.string()),
      dateFrom: z.string().nullable(),
      dateTo: z.string().nullable(),
      days: z.number().int().positive(),
      minScore: z.number().nullable(),
      limit: z.number().int().positive(),
      offset: z.number().int().nonnegative(),
      burst: z.union([z.literal("all"), z.literal("상"), z.literal("중"), z.literal("하")]),
    }),
    items: z.array(z.object({
      id: z.string().trim().min(1),
      title: z.string().trim().min(1),
      url: z.string().trim().min(1),
      publishedAt: z.string().trim().min(1),
      sourceId: z.string().trim().min(1),
      sourceName: z.string().trim().min(1),
      topicId: z.string().trim().min(1),
      topicLabel: z.string().trim().min(1),
      score: z.number().finite(),
      rationale: z.string().trim().min(1).optional(),
      scoreParts: z.unknown().optional(),
      burstLevel: z.enum(["상", "중", "하"]),
    })),
    topics: z.array(z.object({
      topicId: z.string().trim().min(1),
      topicLabel: z.string().trim().min(1),
      count: z.number().int().nonnegative(),
    })),
    sources: z.array(z.object({
      sourceId: z.string().trim().min(1),
      sourceName: z.string().trim().min(1),
      count: z.number().int().nonnegative(),
    })),
  }),
});

export async function GET(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const guarded = withReadGuard(request);
  if (guarded) return guarded;

  const url = new URL(request.url);
  const filters = normalizeFilters(url);

  const index = readNewsSearchIndex() ?? writeNewsSearchIndex({ generatedAt: new Date().toISOString() });
  const trends = readNewsTopicTrends();
  const burstByTopic = new Map((trends?.topics ?? []).map((row) => [asString(row.topicId), row.burstLevel]));

  const searched = searchNewsIndex(index, filters);
  const withBurst = searched.items.filter((row) => {
    if (filters.burst === "all") return true;
    return (burstByTopic.get(asString(row.topicId)) ?? "하") === filters.burst;
  });

  const reranked = [...withBurst].sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    if (a.publishedAt !== b.publishedAt) return b.publishedAt.localeCompare(a.publishedAt);
    return a.title.localeCompare(b.title);
  });

  const start = Math.max(0, filters.offset ?? 0);
  const end = start + Math.max(1, filters.limit ?? 100);
  const sliced = reranked.slice(start, end);

  const topicMap = new Map<string, { topicId: string; topicLabel: string; count: number }>();
  const sourceMap = new Map<string, { sourceId: string; sourceName: string; count: number }>();
  for (const row of reranked) {
    const topicId = asString(row.topicId);
    const topic = topicMap.get(topicId) ?? { topicId, topicLabel: asString(row.topicLabel), count: 0 };
    topic.count += 1;
    topicMap.set(topicId, topic);

    const sourceId = asString(row.sourceId);
    const source = sourceMap.get(sourceId) ?? { sourceId, sourceName: asString(row.sourceName), count: 0 };
    source.count += 1;
    sourceMap.set(sourceId, source);
  }
  const topics = [...topicMap.values()].sort((a, b) => {
    if (a.count !== b.count) return b.count - a.count;
    return a.topicLabel.localeCompare(b.topicLabel);
  });
  const sources = [...sourceMap.values()].sort((a, b) => {
    if (a.count !== b.count) return b.count - a.count;
    return a.sourceName.localeCompare(b.sourceName);
  });

  const payload = parseWithV3Whitelist(SearchResponseSchema, {
    ok: true,
    data: {
      generatedAt: new Date().toISOString(),
      indexGeneratedAt: index.generatedAt,
      total: reranked.length,
      filters: {
        q: filters.q ?? "",
        topics: filters.topics ?? [],
        sources: filters.sources ?? [],
        dateFrom: filters.dateFrom ?? null,
        dateTo: filters.dateTo ?? null,
        days: filters.days ?? 30,
        minScore: Number.isFinite(filters.minScore ?? NaN) ? filters.minScore : null,
        limit: filters.limit ?? 100,
        offset: filters.offset ?? 0,
        burst: filters.burst,
      },
      items: sliced.map((row) => ({
        id: row.id,
        title: row.title,
        url: row.url,
        publishedAt: row.publishedAt,
        sourceId: row.sourceId,
        sourceName: row.sourceName,
        topicId: row.topicId,
        topicLabel: row.topicLabel,
        score: row.score,
        rationale: row.rationale,
        scoreParts: row.scoreParts,
        burstLevel: burstByTopic.get(asString(row.topicId)) ?? "하",
      })),
      topics,
      sources,
    },
  }, { scope: "response", context: "api.v3.news.search" });
  return NextResponse.json(payload);
}
