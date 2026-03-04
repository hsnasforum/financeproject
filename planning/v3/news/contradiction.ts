import { canonicalizeTopicId } from "./taxonomy";

export type ContradictionGrade = "high" | "med" | "low";

export type ContradictionSourceItem = {
  topicId: string;
  topicLabel: string;
  title?: string | null;
  snippet?: string | null;
};

export type TopicContradiction = {
  topicId: string;
  topicLabel: string;
  contradictionGrade: ContradictionGrade;
  upSignals: number;
  downSignals: number;
  signalBalance: number;
  summary: string;
};

const UP_SIGNALS = [
  "인상",
  "긴축",
  "상승",
  "확대",
  "강세",
  "급등",
  "우려",
  "압력",
  "reaccelerat",
  "hike",
  "tighten",
  "surge",
  "rise",
  "hawkish",
];

const DOWN_SIGNALS = [
  "인하",
  "완화",
  "하락",
  "둔화",
  "약세",
  "안정",
  "진정",
  "decelerat",
  "cut",
  "easing",
  "decline",
  "fall",
  "dovish",
  "cool",
];

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeText(input: string): string {
  return asString(input).toLowerCase().replace(/\s+/g, " ");
}

function includesAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function contradictionGradeFromCounts(input: {
  upSignals: number;
  downSignals: number;
}): ContradictionGrade {
  const up = Math.max(0, Math.round(Number(input.upSignals) || 0));
  const down = Math.max(0, Math.round(Number(input.downSignals) || 0));
  const directionalTotal = up + down;
  if (directionalTotal < 2) return "low";

  const balance = Math.min(up, down) / Math.max(1, Math.max(up, down));
  if (directionalTotal >= 5 && balance >= 0.4) return "high";
  if (directionalTotal >= 3 && balance >= 0.25) return "med";
  return "low";
}

function contradictionSummary(grade: ContradictionGrade, upSignals: number, downSignals: number): string {
  if (grade === "high") {
    return `상충 시그널 높음: 상방(${upSignals})·하방(${downSignals}) 신호가 동시에 관찰됩니다.`;
  }
  if (grade === "med") {
    return `상충 시그널 중간: 상방(${upSignals})·하방(${downSignals}) 신호가 혼재되어 있습니다.`;
  }
  return `상충 시그널 낮음: 단일 방향 신호가 우세합니다.`;
}

export function computeTopicContradictions(items: ContradictionSourceItem[]): TopicContradiction[] {
  const buckets = new Map<string, { topicId: string; topicLabel: string; upSignals: number; downSignals: number }>();
  for (const item of items) {
    const topicId = canonicalizeTopicId(asString(item.topicId));
    if (!topicId) continue;
    const topicLabel = asString(item.topicLabel) || topicId;
    const text = normalizeText(`${asString(item.title)} ${asString(item.snippet)}`);
    const up = includesAny(text, UP_SIGNALS) ? 1 : 0;
    const down = includesAny(text, DOWN_SIGNALS) ? 1 : 0;

    const prev = buckets.get(topicId) ?? {
      topicId,
      topicLabel,
      upSignals: 0,
      downSignals: 0,
    };

    buckets.set(topicId, {
      topicId: prev.topicId,
      topicLabel: prev.topicLabel,
      upSignals: prev.upSignals + up,
      downSignals: prev.downSignals + down,
    });
  }

  const rows = [...buckets.values()].map((row) => {
    const contradictionGrade = contradictionGradeFromCounts({
      upSignals: row.upSignals,
      downSignals: row.downSignals,
    });
    const signalBalance = row.upSignals < 1 || row.downSignals < 1
      ? 0
      : round3(Math.min(row.upSignals, row.downSignals) / Math.max(row.upSignals, row.downSignals));
    return {
      topicId: row.topicId,
      topicLabel: row.topicLabel,
      contradictionGrade,
      upSignals: row.upSignals,
      downSignals: row.downSignals,
      signalBalance,
      summary: contradictionSummary(contradictionGrade, row.upSignals, row.downSignals),
    } satisfies TopicContradiction;
  });

  const weight = (grade: ContradictionGrade): number => {
    if (grade === "high") return 3;
    if (grade === "med") return 2;
    return 1;
  };

  return rows.sort((a, b) => {
    const gradeDiff = weight(b.contradictionGrade) - weight(a.contradictionGrade);
    if (gradeDiff !== 0) return gradeDiff;
    if (a.signalBalance !== b.signalBalance) return b.signalBalance - a.signalBalance;
    if (a.upSignals + a.downSignals !== b.upSignals + b.downSignals) {
      return (b.upSignals + b.downSignals) - (a.upSignals + a.downSignals);
    }
    return a.topicId.localeCompare(b.topicId);
  });
}
