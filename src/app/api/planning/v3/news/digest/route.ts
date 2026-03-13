import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, toGuardErrorResponse } from "@/lib/dev/devGuards";
import { normalizeSeriesId } from "@/lib/planning/v3/indicators/aliases";
import { loadEffectiveSeriesSpecs } from "@/lib/planning/v3/indicators/specOverrides";
import { readSeriesObservations } from "@/lib/planning/v3/indicators/store";
import { computeTopicContradictions } from "@/lib/planning/v3/news/contradiction";
import { readNewsDigestDay, type DigestDay, type DigestWatchItem } from "@/lib/planning/v3/news/digest";
import { parseWithV3Whitelist } from "@/lib/planning/v3/security/whitelist";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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

type WatchSparkline = {
  points: number[];
  trend: "up" | "down" | "flat" | "unknown";
  lastValue: number | null;
};

type RouteWatchItem = DigestWatchItem & {
  grade: "상" | "중" | "하" | "unknown";
  sparkline: WatchSparkline | null;
  unknownReasonCode?: "missing" | "disabled" | "no_data" | "insufficient_data" | "invalid_series_id" | "unknown";
  unknownReasonLabel?: string;
  resolveHref?: string | null;
};

type RouteDigest = Omit<DigestDay, "watchlist"> & {
  watchlist: RouteWatchItem[];
};

const INDICATOR_CATALOG_HREF = "/planning/v3/news/settings#indicator-series-specs";

type SeriesSpecStatus = {
  enabled: boolean;
};

function buildSeriesSpecStatusMap(): Map<string, SeriesSpecStatus> {
  try {
    const specs = loadEffectiveSeriesSpecs();
    const out = new Map<string, SeriesSpecStatus>();
    for (const spec of specs) {
      const id = normalizeSeriesId(asString(spec.id));
      if (!id) continue;
      out.set(id, { enabled: spec.enabled !== false });
    }
    return out;
  } catch {
    return new Map();
  }
}

function hasEnoughForPctChange(values: Array<{ value: number }>, window: number): boolean {
  const baseIndex = values.length - 1 - window;
  const base = values[baseIndex];
  if (!base) return false;
  if (!Number.isFinite(base.value)) return false;
  return base.value !== 0;
}

function hasEnoughForZscore(values: Array<{ value: number }>, window: number): boolean {
  if (values.length < 2) return false;
  const start = Math.max(0, values.length - Math.max(2, window));
  const sliced = values.slice(start).map((row) => row.value).filter((row) => Number.isFinite(row));
  if (sliced.length < 2) return false;
  const mean = sliced.reduce((acc, row) => acc + row, 0) / sliced.length;
  const variance = sliced.reduce((acc, row) => {
    const diff = row - mean;
    return acc + diff * diff;
  }, 0) / sliced.length;
  return Number.isFinite(variance) && variance > 0;
}

function inferUnknownReason(input: {
  status: "ok" | "unknown";
  seriesId: string;
  view: "last" | "pctChange" | "zscore";
  window: number;
  seriesSpecs: Map<string, SeriesSpecStatus>;
  observations: Array<{ date: string; value: number }>;
}): Pick<RouteWatchItem, "unknownReasonCode" | "unknownReasonLabel" | "resolveHref"> {
  const normalizedSeriesId = normalizeSeriesId(asString(input.seriesId));
  if (!normalizedSeriesId) {
    return {
      unknownReasonCode: "invalid_series_id",
      unknownReasonLabel: "지표 시리즈 ID가 비어 있습니다.",
      resolveHref: INDICATOR_CATALOG_HREF,
    };
  }

  if (input.status === "ok") {
    return {
      unknownReasonCode: undefined,
      unknownReasonLabel: undefined,
      resolveHref: null,
    };
  }

  const spec = input.seriesSpecs.get(normalizedSeriesId);
  if (!spec) {
    return {
      unknownReasonCode: "missing",
      unknownReasonLabel: "지표 시리즈가 카탈로그에 등록되어 있지 않습니다.",
      resolveHref: INDICATOR_CATALOG_HREF,
    };
  }

  if (!spec.enabled) {
    return {
      unknownReasonCode: "disabled",
      unknownReasonLabel: "지표 시리즈가 비활성화되어 있습니다.",
      resolveHref: INDICATOR_CATALOG_HREF,
    };
  }

  if (input.observations.length < 1) {
    return {
      unknownReasonCode: "no_data",
      unknownReasonLabel: "지표 관측치가 아직 없습니다. 수동 갱신 후 다시 확인해 주세요.",
      resolveHref: "/planning/v3/news",
    };
  }

  if (input.view === "pctChange" && !hasEnoughForPctChange(input.observations, input.window)) {
    return {
      unknownReasonCode: "insufficient_data",
      unknownReasonLabel: "변화율 계산에 필요한 관측치가 부족합니다.",
      resolveHref: "/planning/v3/news",
    };
  }

  if (input.view === "zscore" && !hasEnoughForZscore(input.observations, input.window)) {
    return {
      unknownReasonCode: "insufficient_data",
      unknownReasonLabel: "z-score 계산에 필요한 관측치가 부족합니다.",
      resolveHref: "/planning/v3/news",
    };
  }

  return {
    unknownReasonCode: "unknown",
    unknownReasonLabel: "unknown 원인을 판별하지 못했습니다.",
    resolveHref: "/planning/v3/news",
  };
}

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
  const seriesSpecs = buildSeriesSpecStatusMap();
  const sparklineBySeries = new Map<string, WatchSparkline | null>();
  const observationsBySeries = new Map<string, Array<{ date: string; value: number }>>();
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
          unknownReasonCode: "invalid_series_id",
          unknownReasonLabel: "체크 변수에 seriesId가 없어 지표 조회를 수행할 수 없습니다.",
          resolveHref: INDICATOR_CATALOG_HREF,
        } satisfies RouteWatchItem;
      }
      const normalizedSeriesId = normalizeSeriesId(asString(row.seriesId));
      const normalizedWindow = Math.max(1, Math.round(Number(row.window) || 1));
      const sparklineCacheKey = `${normalizedSeriesId}:${Math.max(1, Math.round(Number(row.window) || 1))}`;
      const sparkline = sparklineBySeries.has(sparklineCacheKey)
        ? sparklineBySeries.get(sparklineCacheKey) ?? null
        : (() => {
          const built = normalizedSeriesId
            ? buildSparkline(normalizedSeriesId, normalizedWindow)
            : null;
          sparklineBySeries.set(sparklineCacheKey, built);
          return built;
        })();
      const observations = normalizedSeriesId
        ? (observationsBySeries.has(normalizedSeriesId)
          ? (observationsBySeries.get(normalizedSeriesId) ?? [])
          : (() => {
            const loaded = readSeriesObservations(normalizedSeriesId)
              .slice()
              .sort((a, b) => a.date.localeCompare(b.date));
            observationsBySeries.set(normalizedSeriesId, loaded);
            return loaded;
          })())
        : [];
      const status = row.status === "ok" ? "ok" : "unknown";
      const valueSummary = asString(row.valueSummary) || "데이터 부족";
      const unknownReason = inferUnknownReason({
        status,
        seriesId: normalizedSeriesId,
        view: row.view === "pctChange" || row.view === "zscore" ? row.view : "last",
        window: normalizedWindow,
        seriesSpecs,
        observations,
      });
      return {
        label: asString(row.label),
        seriesId: normalizedSeriesId,
        view: row.view === "pctChange" || row.view === "zscore" ? row.view : "last",
        window: normalizedWindow,
        status,
        grade: inferGrade(valueSummary, status),
        valueSummary,
        asOf: asString(row.asOf) || null,
        sparkline,
        unknownReasonCode: unknownReason.unknownReasonCode,
        unknownReasonLabel: unknownReason.unknownReasonLabel,
        resolveHref: unknownReason.resolveHref,
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
      unknownReasonCode: z.enum(["missing", "disabled", "no_data", "insufficient_data", "invalid_series_id", "unknown"]).optional(),
      unknownReasonLabel: z.string().trim().min(1).optional(),
      resolveHref: z.string().trim().min(1).nullable().optional(),
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
