import { NextResponse } from "next/server";
import { assertLocalHost, toGuardErrorResponse } from "@/lib/dev/devGuards";
import { onlyDev } from "@/lib/dev/onlyDev";
import { readNewsDigestDay } from "@/lib/news/digestReader";
import { type DigestDay, type DigestWatchItem } from "@/lib/news/types";

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
  return NextResponse.json({ ok: true, data });
}
