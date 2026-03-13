import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, toGuardErrorResponse } from "@/lib/dev/devGuards";
import { closeNewsDatabase, openNewsDatabase, readNewsTopicTrends, type BurstLevel } from "@/lib/planning/v3/news/items";
import { parseWithV3Whitelist } from "@/lib/planning/v3/security/whitelist";

type ItemRow = {
  id: string;
  title: string;
  url: string;
  publishedAt: string;
  sourceId: string;
  sourceName: string;
  topicId: string;
  topicLabel: string;
  score: number;
  burstLevel: BurstLevel;
};

type TopicFacet = {
  topicId: string;
  topicLabel: string;
  count: number;
  burstLevel: BurstLevel;
};

type SourceFacet = {
  sourceId: string;
  sourceName: string;
  count: number;
};

type SearchFilters = {
  q: string;
  topicId: string;
  sourceId: string;
  burst: "all" | BurstLevel;
  days: number;
  limit: number;
  offset: number;
};

const ItemRowSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  url: z.string().trim().min(1),
  publishedAt: z.string().trim().min(1),
  sourceId: z.string().trim().min(1),
  sourceName: z.string().trim().min(1),
  topicId: z.string().trim().min(1),
  topicLabel: z.string().trim().min(1),
  score: z.number().finite(),
  burstLevel: z.enum(["상", "중", "하"]),
});

const TopicFacetSchema = z.object({
  topicId: z.string().trim().min(1),
  topicLabel: z.string().trim().min(1),
  count: z.number().int().nonnegative(),
  burstLevel: z.enum(["상", "중", "하"]),
});

const SourceFacetSchema = z.object({
  sourceId: z.string().trim().min(1),
  sourceName: z.string().trim().min(1),
  count: z.number().int().nonnegative(),
});

const ItemsResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    generatedAt: z.string().datetime(),
    filters: z.object({
      q: z.string(),
      topic: z.string(),
      source: z.string(),
      burst: z.union([z.literal("all"), z.literal("상"), z.literal("중"), z.literal("하")]),
      days: z.number().int().min(7).max(30),
      limit: z.number().int().min(1).max(200),
      offset: z.number().int().nonnegative(),
    }),
    total: z.number().int().nonnegative(),
    items: z.array(ItemRowSchema),
    topics: z.array(TopicFacetSchema),
    sources: z.array(SourceFacetSchema),
  }),
});

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function withReadGuard(request: Request): Response | null {
  try {
    assertSameOrigin(request);
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

function normalizeBurst(value: string): "all" | BurstLevel {
  if (value === "상" || value === "중" || value === "하") return value;
  return "all";
}

function normalizeFilters(url: URL): SearchFilters {
  const q = asString(url.searchParams.get("q"));
  const topicId = asString(url.searchParams.get("topic"));
  const sourceId = asString(url.searchParams.get("source"));
  const burst = normalizeBurst(asString(url.searchParams.get("burst")));
  const daysRaw = Math.round(asNumber(url.searchParams.get("days"), 30));
  const limitRaw = Math.round(asNumber(url.searchParams.get("limit"), 100));
  const offsetRaw = Math.round(asNumber(url.searchParams.get("offset"), 0));
  return {
    q,
    topicId,
    sourceId,
    burst,
    days: Math.max(7, Math.min(30, daysRaw)),
    limit: Math.max(1, Math.min(200, limitRaw)),
    offset: Math.max(0, offsetRaw),
  };
}

function keywordLikePattern(input: string): string {
  const escaped = input.toLowerCase().replaceAll("%", "\\%").replaceAll("_", "\\_");
  return `%${escaped.replace(/\s+/g, "%")}%`;
}

function topicBurstMap(): Map<string, BurstLevel> {
  const artifact = readNewsTopicTrends();
  const out = new Map<string, BurstLevel>();
  for (const row of artifact?.topics ?? []) {
    out.set(asString(row.topicId), row.burstLevel);
  }
  return out;
}

function buildWhere(input: {
  filters: SearchFilters;
  burstMap: Map<string, BurstLevel>;
}): { whereSql: string; params: Record<string, string | number> } {
  const where: string[] = [];
  const params: Record<string, string | number> = {};

  const startMs = Date.now() - (input.filters.days * 24 * 60 * 60 * 1000);
  params.startIso = new Date(startMs).toISOString();
  where.push("publishedAt >= @startIso");

  if (input.filters.q) {
    params.queryLike = keywordLikePattern(input.filters.q);
    where.push(`(
      LOWER(title) LIKE @queryLike ESCAPE '\\'
      OR LOWER(sourceName) LIKE @queryLike ESCAPE '\\'
      OR LOWER(primaryTopicLabel) LIKE @queryLike ESCAPE '\\'
    )`);
  }

  if (input.filters.topicId) {
    params.topicId = input.filters.topicId;
    where.push("primaryTopicId = @topicId");
  }

  if (input.filters.sourceId) {
    params.sourceId = input.filters.sourceId;
    where.push("sourceId = @sourceId");
  }

  if (input.filters.burst !== "all") {
    const topicIds = [...input.burstMap.entries()]
      .filter(([, level]) => level === input.filters.burst)
      .map(([topicId]) => topicId);
    if (topicIds.length < 1) {
      where.push("1 = 0");
    } else {
      const placeholders: string[] = [];
      topicIds.forEach((topicId, index) => {
        const key = `burstTopic${index}`;
        params[key] = topicId;
        placeholders.push(`@${key}`);
      });
      where.push(`primaryTopicId IN (${placeholders.join(", ")})`);
    }
  }

  return {
    whereSql: where.length > 0 ? `WHERE ${where.join(" AND ")}` : "",
    params,
  };
}

export async function GET(request: Request) {
  const guarded = withReadGuard(request);
  if (guarded) return guarded;

  const url = new URL(request.url);
  const filters = normalizeFilters(url);
  const burstByTopic = topicBurstMap();
  const where = buildWhere({ filters, burstMap: burstByTopic });

  const db = openNewsDatabase();
  try {
    const itemsRows = db.prepare(`
      SELECT
        id,
        title,
        url,
        publishedAt,
        sourceId,
        sourceName,
        primaryTopicId AS topicId,
        primaryTopicLabel AS topicLabel,
        relativeScore
      FROM news_items
      ${where.whereSql}
      ORDER BY relativeScore DESC, publishedAt DESC, canonicalUrl ASC
      LIMIT @limit OFFSET @offset
    `).all({ ...where.params, limit: filters.limit, offset: filters.offset }) as Array<Record<string, unknown>>;

    const countRow = db.prepare(`
      SELECT COUNT(1) AS total
      FROM news_items
      ${where.whereSql}
    `).get(where.params) as Record<string, unknown> | undefined;

    const topicRows = db.prepare(`
      SELECT
        primaryTopicId AS topicId,
        primaryTopicLabel AS topicLabel,
        COUNT(1) AS itemCount
      FROM news_items
      ${where.whereSql}
      GROUP BY primaryTopicId, primaryTopicLabel
      ORDER BY itemCount DESC, topicLabel ASC
      LIMIT 50
    `).all(where.params) as Array<Record<string, unknown>>;

    const sourceRows = db.prepare(`
      SELECT
        sourceId,
        sourceName,
        COUNT(1) AS itemCount
      FROM news_items
      ${where.whereSql}
      GROUP BY sourceId, sourceName
      ORDER BY itemCount DESC, sourceName ASC
      LIMIT 50
    `).all(where.params) as Array<Record<string, unknown>>;

    const items: ItemRow[] = itemsRows.map((row) => {
      const topicId = asString(row.topicId);
      return {
        id: asString(row.id),
        title: asString(row.title),
        url: asString(row.url),
        publishedAt: asString(row.publishedAt),
        sourceId: asString(row.sourceId),
        sourceName: asString(row.sourceName),
        topicId,
        topicLabel: asString(row.topicLabel),
        score: asNumber(row.relativeScore, 0),
        burstLevel: burstByTopic.get(topicId) ?? "하",
      };
    });

    const topics: TopicFacet[] = topicRows.map((row) => {
      const topicId = asString(row.topicId);
      return {
        topicId,
        topicLabel: asString(row.topicLabel),
        count: Math.max(0, Math.round(asNumber(row.itemCount, 0))),
        burstLevel: burstByTopic.get(topicId) ?? "하",
      };
    });

    const sources: SourceFacet[] = sourceRows.map((row) => ({
      sourceId: asString(row.sourceId),
      sourceName: asString(row.sourceName),
      count: Math.max(0, Math.round(asNumber(row.itemCount, 0))),
    }));

    const payload = parseWithV3Whitelist(ItemsResponseSchema, {
      ok: true,
      data: {
        generatedAt: new Date().toISOString(),
        filters: {
          q: filters.q,
          topic: filters.topicId,
          source: filters.sourceId,
          burst: filters.burst,
          days: filters.days,
          limit: filters.limit,
          offset: filters.offset,
        },
        total: Math.max(0, Math.round(asNumber(countRow?.total, 0))),
        items,
        topics,
        sources,
      },
    }, { scope: "response", context: "api.v3.news.items" });
    return NextResponse.json(payload);
  } finally {
    closeNewsDatabase(db);
  }
}
