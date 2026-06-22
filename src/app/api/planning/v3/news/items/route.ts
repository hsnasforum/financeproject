import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, toGuardErrorResponse } from "@/lib/dev/devGuards";
import { parseWithV3Whitelist } from "@/lib/planning/v3/security/whitelist";
import {
  readCurrentUserNewsItems,
  type BurstLevel,
  type NewsItemsFilters,
} from "@/lib/planning/v3/service/newsItemsRepository";
import {
  isPlanningRouteUser,
  planningUserMeta,
  requirePlanningRouteUser,
} from "@/lib/planning/api/routeAuth";

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
  meta: z.object({
    userId: z.string().min(1),
    authSource: z.enum(["auth-session", "trusted-header", "local-namespace"]),
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

function normalizeFilters(url: URL): NewsItemsFilters {
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

export async function GET(request: Request) {
  const guarded = withReadGuard(request);
  if (guarded) return guarded;
  const currentUser = await requirePlanningRouteUser(request);
  if (!isPlanningRouteUser(currentUser)) return currentUser;
  const userMeta = planningUserMeta(currentUser);

  const url = new URL(request.url);
  const filters = normalizeFilters(url);

  try {
    const newsItems = readCurrentUserNewsItems(filters);

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
        total: newsItems.total,
        items: newsItems.items,
        topics: newsItems.topics,
        sources: newsItems.sources,
      },
      meta: userMeta,
    }, { scope: "response", context: "api.v3.news.items" });
    return NextResponse.json(payload);
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "INTERNAL", message: "뉴스 항목을 불러오는 중 오류가 발생했습니다." },
        meta: userMeta,
      },
      { status: 500 },
    );
  }
}
