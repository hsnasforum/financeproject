import { NextResponse } from "next/server";
import { z } from "zod";
import { assertLocalHost, toGuardErrorResponse } from "@/lib/dev/devGuards";
import { onlyDev } from "@/lib/dev/onlyDev";
import { readNewsDigestDay } from "@/lib/news/digestReader";
import { type DigestDay, type DigestWatchItem } from "@/lib/news/types";
import { computeTopicContradictions } from "../../../../../../../planning/v3/news/contradiction";
import { parseWithV3Whitelist } from "../../../../../../../planning/v3/security/whitelist";
import { normalizeSeriesId } from "../../../../../../../planning/v3/indicators/aliases";
import { readSeriesObservations } from "../../../../../../../planning/v3/indicators/store";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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

type WatchSparkline = {
  points: number[];
  trend: "up" | "down" | "flat" | "unknown";
  lastValue: number | null;
};

type RouteWatchItem = DigestWatchItem & {
  grade: "상" | "중" | "하" | "unknown";
  sparkline: WatchSparkline | null;
};

type RouteDigest = Omit<DigestDay, "watchlist"> & {
  watchlist: RouteWatchItem[];
};

function buildSparkline(seriesId: string, window: number): WatchSparkline | null {
  const normalizedSeriesId = normalizeSeriesId(seriesId);
  if (!normalizedSeriesId) return null;
  const observations = readSeriesObservations(normalizedSeriesId)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));
  if (observations.length < 1) return null;

  const pointLimit = Math.max(6, Math.min(16, Math.round(window * 1.5)));
  const sliced = observations.slice(-pointLimit);
  const values = sliced.map((row) => row.value).filter((row) => Number.isFinite(row));
  if (values.length < 1) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const points = values.map((value) => {
    if (max <= min) return 50;
    return Math.round(((value - min) / (max - min)) * 100);
  });

  const first = values[0];
  const last = values[values.length - 1];
  const denominator = Math.max(1, Math.abs(first), Math.abs(last));
  const deltaRatio = (last - first) / denominator;
  const trend: WatchSparkline["trend"] = Math.abs(deltaRatio) < 0.01
    ? "flat"
    : deltaRatio > 0
      ? "up"
      : "down";

  return {
    points,
    trend,
    lastValue: Number.isFinite(last) ? last : null,
  };
}

function inferGrade(valueSummary: string, status: "ok" | "unknown"): "상" | "중" | "하" | "unknown" {
  if (status !== "ok") return "unknown";
  if (valueSummary.includes("등급 상") || valueSummary.includes(" 상")) return "상";
  if (valueSummary.includes("등급 중") || valueSummary.includes(" 중")) return "중";
  if (valueSummary.includes("등급 하") || valueSummary.includes(" 하")) return "하";
  return "중";
}

function sanitizeDigest(input: DigestDay | null): RouteDigest | null {
  if (!input) return null;
  const sparklineBySeries = new Map<string, WatchSparkline | null>();
  const watchlist = (input.watchlist ?? [])
    .map((row) => {
      if (typeof row === "string") {
        const label = asString(row);
        if (!label) return null;
        return {
          label,
          seriesId: "",
          view: "last",
          window: 1,
          status: "unknown",
          grade: "unknown",
          valueSummary: "데이터 부족",
          asOf: null,
          sparkline: null,
        } satisfies RouteWatchItem;
      }
      const normalizedSeriesId = normalizeSeriesId(asString(row.seriesId));
      const sparklineCacheKey = `${normalizedSeriesId}:${Math.max(1, Math.round(Number(row.window) || 1))}`;
      const sparkline = sparklineBySeries.has(sparklineCacheKey)
        ? sparklineBySeries.get(sparklineCacheKey) ?? null
        : (() => {
          const built = normalizedSeriesId
            ? buildSparkline(normalizedSeriesId, Math.max(1, Math.round(Number(row.window) || 1)))
            : null;
          sparklineBySeries.set(sparklineCacheKey, built);
          return built;
        })();
      const status = row.status === "ok" ? "ok" : "unknown";
      const valueSummary = asString(row.valueSummary) || "데이터 부족";
      return {
        label: asString(row.label),
        seriesId: normalizedSeriesId,
        view: row.view === "pctChange" || row.view === "zscore" ? row.view : "last",
        window: Math.max(1, Math.round(Number(row.window) || 1)),
        status,
        grade: inferGrade(valueSummary, status),
        valueSummary,
        asOf: asString(row.asOf) || null,
        sparkline,
      } satisfies RouteWatchItem;
    })
    .filter((row) => Boolean(row?.label)) as RouteWatchItem[];

  return {
    date: asString(input.date),
    generatedAt: asString(input.generatedAt),
    topItems: (input.topItems ?? []).map((item) => ({
      topicId: asString(item.topicId),
      topicLabel: asString(item.topicLabel),
      title: asString(item.title),
      url: asString(item.url),
      score: Number(item.score) || 0,
      publishedAt: asString(item.publishedAt),
      sourceName: asString(item.sourceName),
      rationale: asString(item.rationale),
      scoreParts: {
        source: Number(item.scoreParts?.source) || 0,
        recency: Number(item.scoreParts?.recency) || 0,
        keyword: Number(item.scoreParts?.keyword) || 0,
        burst: Number(item.scoreParts?.burst) || 0,
        diversityPenalty: Number(item.scoreParts?.diversityPenalty) || 0,
        duplicatePenalty: Number(item.scoreParts?.duplicatePenalty) || 0,
      },
      snippet: asString(item.snippet),
    })),
    topTopics: (input.topTopics ?? []).map((row) => ({
      topicId: asString(row.topicId),
      topicLabel: asString(row.topicLabel),
      count: Number(row.count) || 0,
      scoreSum: Number(row.scoreSum) || 0,
      burstLevel: row.burstLevel,
    })),
    burstTopics: (input.burstTopics ?? []).map((row) => ({
      topicId: asString(row.topicId),
      topicLabel: asString(row.topicLabel),
      count: Number(row.count) || 0,
      scoreSum: Number(row.scoreSum) || 0,
      burstLevel: row.burstLevel,
    })),
    watchlist,
    scenarioCards: (input.scenarioCards ?? []).map((card) => ({
      name: card.name,
      confidence: card.confidence,
      triggerStatus: card.triggerStatus === "met" || card.triggerStatus === "not_met" ? card.triggerStatus : "unknown",
      triggerSummary: asString(card.triggerSummary),
      observation: asString(card.observation),
      interpretations: (card.interpretations ?? []).map((row) => asString(row)).filter(Boolean),
      confirmIndicators: (card.confirmIndicators ?? []).map((row) => asString(row)).filter(Boolean),
      uncertaintyLabel: asString(card.uncertaintyLabel),
      consensusGrade: card.consensusGrade === "high" || card.consensusGrade === "med" ? card.consensusGrade : "low",
      options: (card.options ?? []).map((row) => asString(row)).filter(Boolean),
      assumptions: (card.assumptions ?? []).map((row) => asString(row)).filter(Boolean),
      trigger: (card.trigger ?? []).map((row) => asString(row)).filter(Boolean),
      invalidation: (card.invalidation ?? []).map((row) => asString(row)).filter(Boolean),
      indicators: (card.indicators ?? []).map((row) => asString(row)).filter(Boolean),
      impactPath: asString(card.impactPath),
      monitoringOptions: (card.monitoringOptions ?? []).map((row) => asString(row)).filter(Boolean),
    })),
    summary: {
      observation: asString(input.summary?.observation),
      evidenceLinks: (input.summary?.evidenceLinks ?? []).map((row) => asString(row)).filter(Boolean),
      watchVariables: (input.summary?.watchVariables ?? []).map((row) => asString(row)).filter(Boolean),
      counterSignals: (input.summary?.counterSignals ?? []).map((row) => asString(row)).filter(Boolean),
    },
  };
}

const DigestRouteSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    date: z.string().trim().min(1),
    generatedAt: z.string().trim().min(1),
    topItems: z.array(z.unknown()),
    topTopics: z.array(z.unknown()),
    burstTopics: z.array(z.unknown()),
    watchlist: z.array(z.object({
      label: z.string().trim().min(1),
      seriesId: z.string(),
      view: z.enum(["last", "pctChange", "zscore"]),
      window: z.number().int().positive(),
      status: z.enum(["ok", "unknown"]),
      grade: z.enum(["상", "중", "하", "unknown"]),
      valueSummary: z.string().trim().min(1),
      asOf: z.string().nullable().optional(),
      sparkline: z.object({
        points: z.array(z.number().int().min(0).max(100)).max(16),
        trend: z.enum(["up", "down", "flat", "unknown"]),
        lastValue: z.number().finite().nullable(),
      }).nullable(),
    })),
    scenarioCards: z.array(z.unknown()),
    summary: z.unknown(),
  }).nullable(),
  topicContradictions: z.array(z.unknown()),
});

export async function GET(request: Request) {
  const blocked = onlyDev();
  if (blocked) return blocked;

  const guarded = withReadGuard(request);
  if (guarded) return guarded;

  const data = sanitizeDigest(readNewsDigestDay());
  const topicContradictions = computeTopicContradictions(
    (data?.topItems ?? []).map((row) => ({
      topicId: asString(row.topicId),
      topicLabel: asString(row.topicLabel),
      title: asString(row.title),
      snippet: asString(row.snippet),
    })),
  );
  const payload = parseWithV3Whitelist(DigestRouteSchema, { ok: true, data, topicContradictions }, {
    scope: "response",
    context: "api.v3.news.digest",
  });
  return NextResponse.json(payload);
}
