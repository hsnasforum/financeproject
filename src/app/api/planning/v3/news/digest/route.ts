import { NextResponse } from "next/server";
import { assertLocalHost, toGuardErrorResponse } from "@/lib/dev/devGuards";
import { onlyDev } from "@/lib/dev/onlyDev";
import { readNewsDigestDay } from "@/lib/news/digestReader";
import { type DigestDay, type DigestWatchItem } from "@/lib/news/types";
import { computeTopicContradictions } from "../../../../../../../planning/v3/news/contradiction";

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

function sanitizeDigest(input: DigestDay | null): DigestDay | null {
  if (!input) return null;
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
          valueSummary: "데이터 부족",
          asOf: null,
        } satisfies DigestWatchItem;
      }
      return {
        label: asString(row.label),
        seriesId: asString(row.seriesId),
        view: row.view === "pctChange" || row.view === "zscore" ? row.view : "last",
        window: Math.max(1, Math.round(Number(row.window) || 1)),
        status: row.status === "ok" ? "ok" : "unknown",
        valueSummary: asString(row.valueSummary) || "데이터 부족",
        asOf: asString(row.asOf) || null,
      } satisfies DigestWatchItem;
    })
    .filter((row) => Boolean(row?.label)) as DigestWatchItem[];

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
  return NextResponse.json({ ok: true, data, topicContradictions });
}
